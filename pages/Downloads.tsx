import React, { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../App.tsx';
import {
  listDownloadedAssets,
  openDownloadedAsset,
  removeDownloadedAsset,
  shareDownloadedAsset,
  type DownloadedAsset,
} from '../lib/downloadedAssets.ts';

export const Downloads: React.FC = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);

  const assets = useMemo(() => {
    if (!user?.id) return [];
    return listDownloadedAssets(user.id);
  }, [user?.id, tick]);

  const filtered = assets.filter((asset) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return asset.title.toLowerCase().includes(q) || asset.fileName.toLowerCase().includes(q);
  });

  const onShare = async (asset: DownloadedAsset) => {
    try {
      await shareDownloadedAsset(asset);
      toast.success('Asset shared');
    } catch {
      toast.error('Unable to share this asset');
    }
  };

  const onOpen = async (asset: DownloadedAsset) => {
    try {
      await openDownloadedAsset(asset);
    } catch {
      toast.error('Unable to open this file');
    }
  };

  const onDelete = (asset: DownloadedAsset) => {
    removeDownloadedAsset(asset.id);
    setTick((v) => v + 1);
    toast.success('Removed from downloads');
  };

  return (
    <div className="bg-[#f1f3f6] min-h-screen py-4 md:py-8">
      <div className="max-w-5xl mx-auto px-3 space-y-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-[#2874f0] font-bold text-xs uppercase tracking-tight hover:underline"
          >
            <i className="fas fa-arrow-left text-[10px]"></i>
            Back
          </button>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-sm fk-shadow">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Downloaded Assets</h1>
          <p className="text-xs text-gray-500 mt-1">Open, re-share, or manage files saved on this device.</p>
        </div>

        <div className="bg-white p-4 rounded-sm fk-shadow">
          <div className="relative">
            <input
              type="text"
              placeholder="Search downloaded assets..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-12 pr-10 py-3 border border-gray-200 rounded-sm text-sm font-medium placeholder-gray-400 focus:outline-none focus:border-[#2874f0]"
            />
            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-sm fk-shadow p-10 text-center">
            <i className="fas fa-cloud-arrow-down text-5xl text-gray-300 mb-4"></i>
            <p className="font-bold text-gray-700">No downloaded assets yet</p>
            <p className="text-xs text-gray-500 mt-2">Download from purchased products and they will show here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((asset) => (
              <div key={asset.id} className="bg-white rounded-sm fk-shadow border border-gray-100 p-4 flex gap-4 items-start">
                <div className="w-16 h-16 rounded-md overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
                  {asset.previewImage ? (
                    <img src={asset.previewImage} alt={asset.title} className="w-full h-full object-cover" />
                  ) : (
                    <i className="fas fa-file text-gray-400"></i>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black text-gray-900 truncate">{asset.title}</h3>
                  <p className="text-[11px] text-gray-500 truncate mt-1">{asset.fileName}</p>
                  <p className="text-[10px] text-gray-400 mt-1">Saved: {new Date(asset.downloadedAt).toLocaleString()}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => onOpen(asset)} className="px-3 py-2 text-[11px] font-black uppercase rounded-md bg-blue-50 text-[#2874f0] hover:bg-blue-100">
                      <i className="fas fa-eye mr-1"></i>View
                    </button>
                    <button onClick={() => onShare(asset)} className="px-3 py-2 text-[11px] font-black uppercase rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                      <i className="fas fa-share-alt mr-1"></i>Share
                    </button>
                    <button onClick={() => navigate(`/product/${asset.productId}`)} className="px-3 py-2 text-[11px] font-black uppercase rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
                      <i className="fas fa-box-open mr-1"></i>Product
                    </button>
                    <button onClick={() => onDelete(asset)} className="px-3 py-2 text-[11px] font-black uppercase rounded-md bg-red-50 text-red-600 hover:bg-red-100">
                      <i className="fas fa-trash mr-1"></i>Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
