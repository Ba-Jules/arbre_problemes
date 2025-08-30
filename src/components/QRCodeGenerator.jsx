import React from 'react';

const QRCodeGenerator = ({ value, size = 150 }) => {
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`;
  
  return (
    <div className="bg-white p-4 rounded-lg shadow-lg">
      <img 
        src={qrCodeUrl} 
        alt="QR Code" 
        className="mx-auto"
        width={size}
        height={size}
        onError={(e) => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'block';
        }}
      />
      <div 
        className="hidden w-20 h-20 bg-gray-800 flex items-center justify-center text-white text-xs font-bold text-center leading-tight mx-auto"
      >
        QR<br/>CODE
      </div>
      <p className="text-xs text-center mt-2 font-bold">Participants</p>
      <div className="text-xs text-center mt-1 bg-gray-100 p-2 rounded max-w-48 break-all mx-auto">
        {value}
      </div>
    </div>
  );
};

export default QRCodeGenerator;