
import React from 'react';

interface LogoutModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const LogoutModal: React.FC<LogoutModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-in fade-in duration-300" 
        onClick={onCancel}
      />
      
      {/* Modal Card */}
      <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative z-10 transform animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="p-10 text-center">
          <div className="w-24 h-24 bg-red-50 text-red-500 rounded-[2rem] flex items-center justify-center text-4xl mx-auto mb-8 shadow-inner rotate-3">
            <i className="fas fa-sign-out-alt"></i>
          </div>
          <h3 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Logging Out?</h3>
          <p className="text-sm text-gray-400 font-bold uppercase tracking-widest leading-relaxed">
            Are you sure you want to end your session?
          </p>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">
            You'll need to sign back in to access your digital downloads.
          </p>
        </div>
        
        <div className="flex border-t border-gray-100 h-16">
          <button 
            onClick={onCancel}
            className="flex-1 px-6 text-[11px] font-black text-gray-400 hover:text-gray-900 hover:bg-gray-50 transition-all uppercase tracking-[0.2em] border-r border-gray-100"
          >
            No, Keep Me
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 px-6 text-[11px] font-black text-red-500 hover:bg-red-50 transition-all uppercase tracking-[0.2em]"
          >
            Yes, Log Out
          </button>
        </div>
      </div>
    </div>
  );
};
