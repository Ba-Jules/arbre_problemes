import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase-config';
import QRCodeGenerator from './components/QRCodeGenerator';

// Types
const COLORS = {
  problem: { bg: '#ef4444', text: 'white', border: '#dc2626' },
  causes: { bg: '#fb7185', text: 'white', border: '#f43f5e' },
  consequences: { bg: '#22c55e', text: 'white', border: '#16a34a' }
};

const CATEGORY_LABELS = {
  problem: 'Problème Central',
  causes: 'Causes',
  consequences: 'Conséquences'
};

export default function App() {
  const [mode, setMode] = useState('moderator');
  const [sessionId, setSessionId] = useState('PROBLEM-TREE-2025');
  const [postIts, setPostIts] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedPostIt, setSelectedPostIt] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // Mode connexion
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionSource, setConnectionSource] = useState(null);
  
  // États des panneaux
  const [panelStates, setPanelStates] = useState({
    causes: 'normal',
    tree: 'normal',
    consequences: 'normal',
    problems: 'normal'
  });
  
  // États participant
  const [participantName, setParticipantName] = useState(() => 
    localStorage.getItem('participantName') || ''
  );
  const [selectedCategory, setSelectedCategory] = useState('problem');
  const [participantContent, setParticipantContent] = useState('');
  const [showAnonymousOption, setShowAnonymousOption] = useState(false);

  // Références
  const treeAreaRef = useRef(null);
  const svgRef = useRef(null);

  // URL pour participants
  const participantUrl = `${window.location.origin}${window.location.pathname}?session=${sessionId}&mode=participant`;

  // Écouter les paramètres URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    const sessionParam = urlParams.get('session');
    
    if (modeParam === 'participant') {
      setMode('participant');
    }
    if (sessionParam) {
      setSessionId(sessionParam);
    }
  }, []);

  // Synchronisation Firebase temps réel
  useEffect(() => {
    if (!sessionId) return;

    // Écouter les post-its
    const postItsQuery = query(
      collection(db, 'postits'),
      where('sessionId', '==', sessionId),
      orderBy('timestamp', 'asc')
    );

    const unsubscribePostIts = onSnapshot(postItsQuery, (snapshot) => {
      const newPostIts = [];
      snapshot.forEach((doc) => {
        newPostIts.push({ id: doc.id, ...doc.data() });
      });
      setPostIts(newPostIts);
    });

    // Écouter les connexions
    const connectionsQuery = query(
      collection(db, 'connections'),
      where('sessionId', '==', sessionId)
    );

    const unsubscribeConnections = onSnapshot(connectionsQuery, (snapshot) => {
      const newConnections = [];
      snapshot.forEach((doc) => {
        newConnections.push({ id: doc.id, ...doc.data() });
      });
      setConnections(newConnections);
    });

    return () => {
      unsubscribePostIts();
      unsubscribeConnections();
    };
  }, [sessionId]);

  // Initialiser avec problème central
  useEffect(() => {
    if (postIts.length === 0 && mode === 'moderator') {
      addPostItToFirebase(
        'Cliquez pour définir le problème central',
        'problem',
        'Modérateur',
        400,
        300,
        true
      );
    }
  }, [postIts.length, mode]);

  // Fonctions Firebase
  const addPostItToFirebase = async (content, category, author, x = null, y = null, isInTree = false) => {
    if (!content.trim()) return;

    const defaultPositions = {
      causes: { x: 100, y: Math.random() * 100 + 100 },
      consequences: { x: 700, y: Math.random() * 100 + 100 },
      problem: { x: 400, y: Math.random() * 100 + 100 }
    };

    const position = x !== null ? { x, y } : defaultPositions[category];

    try {
      await addDoc(collection(db, 'postits'), {
        sessionId,
        content: content.trim(),
        author,
        category,
        x: position.x,
        y: position.y,
        isInTree,
        childIds: [],
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Erreur ajout post-it:', error);
    }
  };

  const updatePostItInFirebase = async (id, updates) => {
    try {
      await updateDoc(doc(db, 'postits', id), updates);
    } catch (error) {
      console.error('Erreur mise à jour post-it:', error);
    }
  };

  const deletePostItFromFirebase = async (id) => {
    if (id.includes('central-problem')) return;
    
    try {
      await deleteDoc(doc(db, 'postits', id));
      // Supprimer aussi les connexions liées
      const relatedConnections = connections.filter(c => c.fromId === id || c.toId === id);
      for (const conn of relatedConnections) {
        await deleteDoc(doc(db, 'connections', conn.id));
      }
    } catch (error) {
      console.error('Erreur suppression post-it:', error);
    }
  };

  const addConnectionToFirebase = async (fromId, toId) => {
    setTimeout(async () => {
      const fromPostIt = postIts.find(p => p.id === fromId);
      const toPostIt = postIts.find(p => p.id === toId);
      
      if (!fromPostIt || !toPostIt) return;

      try {
        await addDoc(collection(db, 'connections'), {
          sessionId,
          fromId,
          toId,
          fromX: fromPostIt.x + 100,
          fromY: fromPostIt.y + 25,
          toX: toPostIt.x + 100,
          toY: toPostIt.y + 25,
          timestamp: serverTimestamp()
        });
      } catch (error) {
        console.error('Erreur ajout connexion:', error);
      }
    }, 100);
  };

  // Gestion des panneaux
  const handleWindowAction = (panel, action) => {
    switch (action) {
      case 'minimize':
        setPanelStates(prev => ({ ...prev, [panel]: 'minimized' }));
        break;
      case 'maximize':
        setPanelStates({
          causes: panel === 'causes' ? 'maximized' : 'minimized',
          tree: panel === 'tree' ? 'maximized' : 'minimized',
          consequences: panel === 'consequences' ? 'maximized' : 'minimized',
          problems: panel === 'problems' ? 'maximized' : 'minimized'
        });
        break;
      case 'restore':
        setPanelStates({
          causes: 'normal',
          tree: 'normal',
          consequences: 'normal',
          problems: 'normal'
        });
        break;
    }
  };

  const getPanelClasses = (panel, baseClasses) => {
    const state = panelStates[panel];
    switch (state) {
      case 'maximized': return 'col-span-12 row-span-12 z-50';
      case 'minimized': return 'col-span-1 row-span-1 min-h-[40px]';
      default: return baseClasses;
    }
  };

  // Mode connexion
  const toggleConnectionMode = () => {
    setIsConnecting(prev => !prev);
    setConnectionSource(null);
  };

  const handlePostItClick = (postItId, e) => {
    if (!isConnecting) return;

    e.stopPropagation();

    if (!connectionSource) {
      setConnectionSource(postItId);
    } else if (connectionSource !== postItId) {
      addConnectionToFirebase(connectionSource, postItId);
      setConnectionSource(null);
      setIsConnecting(false);
    } else {
      setConnectionSource(null);
      setIsConnecting(false);
    }
  };

  // Drag & Drop
  const handleMouseDown = (e, postItId) => {
    if (isConnecting) {
      handlePostItClick(postItId, e);
      return;
    }

    e.preventDefault();
    setSelectedPostIt(postItId);
    setIsDragging(true);
    
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !selectedPostIt) return;

    const treeArea = treeAreaRef.current;
    if (!treeArea) return;

    const rect = treeArea.getBoundingClientRect();
    const newX = Math.max(0, Math.min(rect.width - 200, e.clientX - rect.left - dragOffset.x));
    const newY = Math.max(0, Math.min(rect.height - 50, e.clientY - rect.top - dragOffset.y));

    // Mise à jour locale immédiate
    setPostIts(prev => prev.map(p => 
      p.id === selectedPostIt ? { ...p, x: newX, y: newY, isInTree: true } : p
    ));

    // Mise à jour Firebase
    updatePostItInFirebase(selectedPostIt, { x: newX, y: newY, isInTree: true });
  }, [isDragging, selectedPostIt, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setSelectedPostIt(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Interface participant
  const handleParticipantSubmit = () => {
    if (!participantContent.trim()) return;

    const author = showAnonymousOption ? 'Anonyme' : participantName || 'Anonyme';
    addPostItToFirebase(participantContent, selectedCategory, author);
    setParticipantContent('');
  };

  // Composants
  const PanelHeader = ({ title, color, panel, onAddPostIt }) => {
    const state = panelStates[panel];
    
    return (
      <div className="flex items-center justify-between p-2 border-b bg-gradient-to-r from-blue-50 to-blue-100 border-gray-300">
        <h3 className="font-bold text-sm flex-1" style={{ color }}>
          {state === 'minimized' ? title.split(' ')[0] : title}
        </h3>
        
        <div className="flex items-center gap-2">
          {state !== 'minimized' && (
            <button
              onClick={onAddPostIt}
              className="w-6 h-6 bg-indigo-500 text-white rounded text-xs font-bold hover:bg-indigo-600 flex items-center justify-center"
            >
              +
            </button>
          )}
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleWindowAction(panel, 'minimize')}
              className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded-sm flex items-center justify-center text-gray-600 text-xs"
            >
              −
            </button>
            <button
              onClick={() => handleWindowAction(panel, state === 'maximized' ? 'restore' : 'maximize')}
              className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded-sm flex items-center justify-center text-gray-600 text-xs"
            >
              {state === 'maximized' ? '⧉' : '□'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPostIt = (postIt) => {
    const colors = COLORS[postIt.category];
    const isSelected = selectedPostIt === postIt.id;
    const isConnectionSource = connectionSource === postIt.id;
    
    return (
      <div
        key={postIt.id}
        className={`absolute select-none transition-all duration-200 ${
          isSelected ? 'scale-105 z-50' : 'z-10'
        } ${
          isConnecting ? 'cursor-pointer' : 'cursor-move'
        } ${
          isConnectionSource ? 'ring-4 ring-blue-400 ring-opacity-75' : ''
        }`}
        style={{
          left: postIt.x,
          top: postIt.y,
          width: '200px',
          minHeight: '50px'
        }}
        onMouseDown={(e) => handleMouseDown(e, postIt.id)}
      >
        <div
          className="rounded-lg p-3 shadow-lg border-2 relative"
          style={{
            backgroundColor: colors.bg,
            color: colors.text,
            borderColor: colors.border,
            fontFamily: "'Arial Black', Arial, sans-serif",
            fontSize: Math.max(12, Math.min(16, 200 / Math.max(1, postIt.content.length / 10)))
          }}
        >
          {isConnecting && (
            <div className="absolute -top-1 -left-1 w-6 h-6 bg-blue-500 text-white rounded-full text-xs flex items-center justify-center animate-pulse">
              🔗
            </div>
          )}

          <div
            className="font-bold leading-tight"
            contentEditable={mode === 'moderator' && !isConnecting}
            suppressContentEditableWarning
            onBlur={(e) => updatePostItInFirebase(postIt.id, { content: e.currentTarget.textContent || '' })}
          >
            {postIt.content}
          </div>
          
          <div className="text-xs mt-1 opacity-80">
            {postIt.author}
          </div>

          {mode === 'moderator' && !isConnecting && (
            <>
              <div className="absolute -top-2 -right-2 flex gap-1">
                <button
                  className="w-6 h-6 bg-white text-black rounded-full text-xs font-bold shadow-md hover:bg-gray-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    addPostItToFirebase(
                      'Nouveau',
                      postIt.category === 'causes' ? 'causes' : 'consequences',
                      'Modérateur',
                      postIt.x,
                      postIt.y - 80,
                      true
                    );
                  }}
                >
                  +
                </button>

                {!postIt.id.includes('central-problem') && (
                  <button
                    className="w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold shadow-md hover:bg-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePostItFromFirebase(postIt.id);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-6 h-6 bg-white text-black rounded-full text-xs font-bold shadow-md hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  addPostItToFirebase(
                    'Nouveau',
                    postIt.category === 'consequences' ? 'consequences' : 'causes',
                    'Modérateur',
                    postIt.x,
                    postIt.y + 80,
                    true
                  );
                }}
              >
                +
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderConnections = () => {
    return connections.map(conn => {
      const dx = conn.toX - conn.fromX;
      const dy = conn.toY - conn.fromY;
      const midY = conn.fromY + dy / 2;
      
      return (
        <g key={conn.id}>
          <path
            d={`M ${conn.fromX} ${conn.fromY} L ${conn.fromX} ${midY} L ${conn.toX} ${midY} L ${conn.toX} ${conn.toY}`}
            stroke="#374151"
            strokeWidth="3"
            fill="none"
            markerEnd="url(#arrowhead)"
          />
        </g>
      );
    });
  };

  if (mode === 'participant') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-gray-800 mb-2">🌳 Arbre à Problèmes</h1>
            <p className="text-gray-600">Session: {sessionId}</p>
          </div>

          {!participantName && !showAnonymousOption && (
            <div className="bg-white rounded-xl p-6 shadow-lg mb-6">
              <h2 className="text-lg font-bold mb-4">Votre nom</h2>
              <input
                type="text"
                placeholder="Entrez votre nom..."
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                className="w-full p-3 border-2 border-gray-300 rounded-lg text-lg"
                style={{ fontFamily: "'Arial Black', Arial, sans-serif" }}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => {
                    localStorage.setItem('participantName', participantName || 'Participant');
                  }}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-bold"
                  disabled={!participantName.trim()}
                >
                  Continuer
                </button>
                <button
                  onClick={() => setShowAnonymousOption(true)}
                  className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold"
                >
                  Anonyme
                </button>
              </div>
            </div>
          )}

          {(participantName || showAnonymousOption) && (
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <h2 className="text-lg font-bold mb-4">Contribuer</h2>
              
              <div className="mb-4">
                <label className="block font-bold mb-2">Catégorie :</label>
                <div className="grid grid-cols-1 gap-2">
                  {Object.keys(CATEGORY_LABELS).map(category => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`p-3 rounded-lg font-bold text-left ${
                        selectedCategory === category 
                          ? 'ring-2 ring-offset-2 ring-indigo-500' 
                          : 'hover:bg-gray-50'
                      }`}
                      style={{
                        backgroundColor: selectedCategory === category ? COLORS[category].bg : '#f9fafb',
                        color: selectedCategory === category ? COLORS[category].text : '#374151',
                        fontFamily: "'Arial Black', Arial, sans-serif"
                      }}
                    >
                      {CATEGORY_LABELS[category]}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                placeholder="Écrivez votre contribution..."
                value={participantContent}
                onChange={(e) => setParticipantContent(e.target.value)}
                className="w-full p-4 border-2 border-gray-300 rounded-lg resize-none h-24 text-lg"
                style={{ fontFamily: "'Arial Black', Arial, sans-serif" }}
              />

              <button
                onClick={handleParticipantSubmit}
                disabled={!participantContent.trim()}
                className="w-full mt-4 py-3 bg-indigo-600 text-white rounded-lg font-bold disabled:bg-gray-300"
              >
                Envoyer
              </button>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600">
                  Connecté: <strong>{showAnonymousOption ? 'Anonyme' : participantName}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="bg-white shadow-sm p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-gray-800">🌳 Arbre à Problèmes Collaboratif</h1>
            <p className="text-gray-600">Session: {sessionId}</p>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={toggleConnectionMode}
              className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all ${
                isConnecting
                  ? 'bg-blue-600 text-white shadow-lg scale-105'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              🔗 {isConnecting ? 'Mode Connexion ON' : 'Connecter Post-its'}
            </button>
            
            {isConnecting && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded">
                <div className="text-sm text-blue-800 font-semibold">
                  {!connectionSource ? '1. Cliquez sur le post-it SOURCE' : '2. Cliquez sur le post-it CIBLE'}
                </div>
              </div>
            )}
            
            <QRCodeGenerator value={participantUrl} size={80} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 grid grid-cols-12 grid-rows-12 gap-2 h-[calc(100vh-120px)]">
        <div className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses('causes', 'col-span-3 row-span-9')}`}>
          <PanelHeader
            title="📝 Causes"
            color={COLORS.causes.bg}
            panel="causes"
            onAddPostIt={() => addPostItToFirebase('Nouvelle cause', 'causes', 'Modérateur')}
          />
          
          {panelStates.causes !== 'minimized' && (
            <div className="flex-1 p-4 overflow-hidden">
              <div className="space-y-3 max-h-full overflow-y-auto">
                {postIts.filter(p => p.category === 'causes' && !p.isInTree).map(postIt => (
                  <div
                    key={postIt.id}
                    className="p-3 rounded-lg cursor-move shadow-sm border-2 group relative"
                    style={{
                      backgroundColor: COLORS.causes.bg,
                      color: COLORS.causes.text,
                      borderColor: COLORS.causes.border,
                      fontFamily: "'Arial Black', Arial, sans-serif"
                    }}
                    onMouseDown={(e) => handleMouseDown(e, postIt.id)}
                  >
                    <div className="font-bold text-sm">{postIt.content}</div>
                    <div className="text-xs mt-1 opacity-80">{postIt.author}</div>
                    
                    {isConnecting && (
                      <div className="absolute -top-1 -left-1 w-5 h-5 bg-blue-500 text-white rounded-full text-xs flex items-center justify-center">
                        🔗
                      </div>
                    )}
                    
                    {!isConnecting && (
                      <button
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePostItFromFirebase(postIt.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses('tree', 'col-span-6 row-span-9')}`}>
          <PanelHeader
            title="🌳 Arbre à Problèmes"
            color="#374151"
            panel="tree"
            onAddPostIt={() => {}}
          />
          
          {panelStates.tree !== 'minimized' && (
            <div className="flex-1 relative overflow-hidden">
              <div 
                ref={treeAreaRef}
                className="w-full h-full relative"
              >
                <svg
                  ref={svgRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ zIndex: 1 }}
                >
                  <defs>
                    <marker
                      id="arrowhead"
                      markerWidth="10"
                      markerHeight="7"
                      refX="9"
                      refY="3.5"
                      orient="auto"
                    >
                      <polygon
                        points="0 0, 10 3.5, 0 7"
                        fill="#374151"
                      />
                    </marker>
                  </defs>
                  {renderConnections()}
                </svg>

                {postIts.filter(p => p.isInTree).map(renderPostIt)}
              </div>
            </div>
          )}
        </div>

        <div className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses('consequences', 'col-span-3 row-span-9')}`}>
          <PanelHeader
            title="📈 Conséquences"
            color={COLORS.consequences.bg}
            panel="consequences"
            onAddPostIt={() => addPostItToFirebase('Nouvelle conséquence', 'consequences', 'Modérateur')}
          />
          
          {panelStates.consequences !== 'minimized' && (
            <div className="flex-1 p-4 overflow-hidden">
              <div className="space-y-3 max-h-full overflow-y-auto">
                {postIts.filter(p => p.category === 'consequences' && !p.isInTree).map(postIt => (
                  <div
                    key={postIt.id}
                    className="p-3 rounded-lg cursor-move shadow-sm border-2 group relative"
                    style={{
                      backgroundColor: COLORS.consequences.bg,
                      color: COLORS.consequences.text,
                      borderColor: COLORS.consequences.border,
                      fontFamily: "'Arial Black', Arial, sans-serif"
                    }}
                    onMouseDown={(e) => handleMouseDown(e, postIt.id)}
                  >
                    <div className="font-bold text-sm">{postIt.content}</div>
                    <div className="text-xs mt-1 opacity-80">{postIt.author}</div>
                    
                    {isConnecting && (
                      <div className="absolute -top-1 -left-1 w-5 h-5 bg-blue-500 text-white rounded-full text-xs flex items-center justify-center">
                        🔗
                      </div>
                    )}
                    
                    {!isConnecting && (
                      <button
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePostItFromFirebase(postIt.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`bg-white rounded-lg shadow-lg flex flex-col border border-gray-300 ${getPanelClasses('problems', 'col-span-12 row-span-3')}`}>
          <PanelHeader
            title="🎯 Problèmes Suggérés"
            color={COLORS.problem.bg}
            panel="problems"
            onAddPostIt={() => addPostItToFirebase('Nouveau problème', 'problem', 'Modérateur')}
          />
          
          {panelStates.problems !== 'minimized' && (
            <div className="flex-1 p-4 overflow-hidden">
              <div className="flex gap-3 overflow-x-auto h-full">
                {postIts.filter(p => p.category === 'problem' && !p.isInTree).map(postIt => (
                  <div
                    key={postIt.id}
                    className="p-3 rounded-lg cursor-move shadow-sm border-2 flex-shrink-0 min-w-[200px] group relative"
                    style={{
                      backgroundColor: COLORS.problem.bg,
                      color: COLORS.problem.text,
                      borderColor: COLORS.problem.border,
                      fontFamily: "'Arial Black', Arial, sans-serif"
                    }}
                    onMouseDown={(e) => handleMouseDown(e, postIt.id)}
                  >
                    <div className="font-bold text-sm">{postIt.content}</div>
                    <div className="text-xs mt-1 opacity-80">{postIt.author}</div>
                    
                    {isConnecting && (
                      <div className="absolute -top-1 -left-1 w-5 h-5 bg-blue-500 text-white rounded-full text-xs flex items-center justify-center">
                        🔗
                      </div>
                    )}
                    
                    {!isConnecting && (
                      <button
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePostItFromFirebase(postIt.id);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}