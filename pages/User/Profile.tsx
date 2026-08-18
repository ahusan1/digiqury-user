
import React, { useContext, useState, useEffect } from 'react';
import { AuthContext } from '../../App.tsx';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase.ts';
import { toast } from 'react-hot-toast';

export const Profile: React.FC = () => {
  const { user, setUser, wishlist, toggleWishlist, addToCart, isInCart, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'wishlist'>('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orderCount, setOrderCount] = useState(0);

  
  const [formData, setFormData] = useState({
    name: '',
    phone: ''
  });

  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || ''
      });
      fetchOrderCount();
    }
  }, [user]);

  const fetchOrderCount = async () => {
    if (!user) return;
    const { count, error } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'paid');
    
    if (!error) setOrderCount(count || 0);
  };

  if (!user) return null;

  const handleUpdate = async () => {
    if (!formData.name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: formData.name,
          phone: formData.phone
        })
        .eq('id', user.id);

      if (error) throw error;

      setUser({ ...user, ...formData });
      setIsEditing(false);
      toast.success("Profile updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      });

      if (error) throw error;

      toast.success("Password updated successfully");
      setIsChangingPassword(false);
      setPasswordData({ newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const confirmLogout = window.confirm("Are you sure you want to log out of your DIGi QuRY account?");
    if (confirmLogout) {
      await logout();
      navigate('/');
    }
  };

  return (
    <div className="bg-[#f1f3f6] min-h-screen py-6 md:py-12">
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        
        {/* Navigation / Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-5">
            <button 
              onClick={() => navigate('/')}
              className="bg-white p-3 rounded-2xl text-gray-400 hover:text-[#2874f0] transition-all shadow-xl fk-shadow border border-gray-50 active:scale-90"
            >
              <i className="fas fa-arrow-left"></i>
            </button>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-none">Dashboard</h1>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest bg-gray-200/50 px-2 py-0.5 rounded">User Center</span>
                <span className="text-[10px] text-[#2874f0] font-black uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded">Premium Member</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="bg-white px-6 py-3 rounded-3xl fk-shadow border border-gray-100 flex items-center gap-4 group hover:border-blue-200 transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#2874f0] flex items-center justify-center text-lg">
                <i className="fas fa-shopping-bag"></i>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 font-black uppercase leading-none tracking-widest">Total Purchases</p>
                <p className="text-xl font-black text-gray-900 leading-none mt-1.5">{orderCount}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1 space-y-6">
            {/* User Profile Summary Card */}
            <div className="bg-white rounded-[2.5rem] p-8 fk-shadow border border-gray-100 flex flex-col items-center text-center relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#2874f0] to-[#fb641b]"></div>
              <div className="w-24 h-24 bg-gradient-to-br from-[#2874f0] to-[#1a5abf] text-white rounded-[2.5rem] flex items-center justify-center text-4xl font-black mb-5 shadow-2xl shadow-blue-500/20 group-hover:rotate-3 transition-transform">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-xl font-black text-gray-900 truncate w-full tracking-tight">{user.name}</h2>
              <p className="text-xs text-gray-400 font-bold truncate w-full mb-6 italic">{user.email}</p>
              
              <div className="w-full pt-6 border-t border-gray-50 grid grid-cols-2 gap-2">
                 <div className="p-2 bg-gray-50 rounded-2xl">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Status</p>
                    <p className="text-[10px] font-black text-green-600 uppercase">Active</p>
                 </div>
                 <div className="p-2 bg-gray-50 rounded-2xl">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Verified</p>
                    <p className="text-[10px] font-black text-blue-600 uppercase">Yes</p>
                 </div>
              </div>
            </div>

            {/* Menu List */}
            <div className="bg-white rounded-[2.5rem] overflow-hidden fk-shadow border border-gray-100">
              <div className="p-5 bg-gray-50/50 border-b border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">General Settings</p>
              </div>
              
              <div className="p-2 space-y-1">
                <button 
                  onClick={() => setActiveTab('profile')}
                  className={`w-full flex items-center gap-4 px-6 py-4 text-sm font-black transition-all rounded-[1.5rem] ${activeTab === 'profile' ? 'bg-[#2874f0] text-white shadow-xl shadow-blue-500/20' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <i className={`fas fa-user-circle w-5 text-center text-lg`}></i>
                  Personal Info
                </button>

                <button 
                  onClick={() => setActiveTab('wishlist')}
                  className={`w-full flex items-center gap-4 px-6 py-4 text-sm font-black transition-all rounded-[1.5rem] ${activeTab === 'wishlist' ? 'bg-[#2874f0] text-white shadow-xl shadow-blue-500/20' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <i className={`fas fa-heart w-5 text-center text-lg`}></i>
                  My Wishlist
                  {wishlist.length > 0 && <span className={`ml-auto ${activeTab === 'wishlist' ? 'bg-white text-[#2874f0]' : 'bg-[#2874f0] text-white'} text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black`}>{wishlist.length}</span>}
                </button>

                <button 
                  onClick={() => setActiveTab('security')}
                  className={`w-full flex items-center gap-4 px-6 py-4 text-sm font-black transition-all rounded-[1.5rem] ${activeTab === 'security' ? 'bg-[#2874f0] text-white shadow-xl shadow-blue-500/20' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <i className={`fas fa-shield-alt w-5 text-center text-lg`}></i>
                  Security & Access
                </button>
              </div>

              <div className="p-5 bg-gray-50/50 border-y border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Transactions</p>
              </div>

              <div className="p-2 space-y-1">
                <button 
                  onClick={() => navigate('/dashboard')}
                  className="w-full flex items-center gap-4 px-6 py-4 text-sm font-black text-gray-600 hover:bg-gray-50 transition-all rounded-[1.5rem]"
                >
                  <i className="fas fa-history w-5 text-center text-lg text-gray-300"></i>
                  Order History
                </button>

                <button 
                  onClick={() => navigate('/cart')}
                  className="w-full flex items-center gap-4 px-6 py-4 text-sm font-black text-gray-600 hover:bg-gray-50 transition-all rounded-[1.5rem]"
                >
                  <i className="fas fa-shopping-cart w-5 text-center text-lg text-gray-300"></i>
                  View Cart
                </button>

                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center gap-4 px-6 py-5 text-sm font-black text-red-500 hover:bg-red-50 transition-all rounded-[1.5rem] border-t border-gray-50 mt-4"
                >
                  <i className="fas fa-power-off w-5 text-center text-lg"></i>
                  Sign Out Account
                </button>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3 space-y-8">
            
            {activeTab === 'profile' && (
              <div className="bg-white rounded-[3rem] p-8 md:p-12 fk-shadow border border-gray-100 transition-all">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 pb-8 border-b border-gray-50">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight italic">Profile Identity</h2>
                    <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-1">Manage public name and communication</p>
                  </div>
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className={`px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 ${isEditing ? 'bg-gray-100 text-gray-500' : 'bg-[#fb641b] text-white shadow-orange-500/20'}`}
                  >
                    {isEditing ? 'Discard Changes' : 'Update Profile'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-3">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Your Full Name</label>
                    {isEditing ? (
                      <div className="relative group">
                        <input 
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          className="w-full px-6 py-5 bg-gray-50 border border-gray-100 rounded-3xl focus:border-[#2874f0] focus:ring-4 focus:ring-blue-50 outline-none font-black text-sm transition-all shadow-inner"
                        />
                        <i className="fas fa-signature text-gray-300 absolute right-6 top-1/2 -translate-y-1/2 group-focus-within:text-[#2874f0]"></i>
                      </div>
                    ) : (
                      <p className="px-6 py-5 bg-gray-50/50 rounded-3xl font-black text-gray-800 text-base border border-transparent flex items-center gap-3">
                        <i className="fas fa-id-card text-gray-300"></i>
                        {user.name}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone Connectivity</label>
                    {isEditing ? (
                      <div className="relative group">
                        <input 
                          type="text"
                          value={formData.phone}
                          onChange={(e) => setFormData({...formData, phone: e.target.value})}
                          className="w-full px-6 py-5 bg-gray-50 border border-gray-100 rounded-3xl focus:border-[#2874f0] focus:ring-4 focus:ring-blue-50 outline-none font-black text-sm transition-all shadow-inner"
                          placeholder="+91 ..."
                        />
                         <i className="fas fa-phone-alt text-gray-300 absolute right-6 top-1/2 -translate-y-1/2 group-focus-within:text-[#2874f0]"></i>
                      </div>
                    ) : (
                      <p className="px-6 py-5 bg-gray-50/50 rounded-3xl font-black text-gray-800 text-base border border-transparent flex items-center gap-3">
                        <i className="fas fa-mobile-screen text-gray-300"></i>
                        {user.phone || 'No phone linked'}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Official Email Address</label>
                    <div className="px-6 py-5 bg-gray-100/50 rounded-3xl border border-gray-50 flex items-center justify-between opacity-70">
                      <div className="flex items-center gap-3">
                         <i className="fas fa-envelope text-gray-400"></i>
                         <span className="font-bold text-gray-500 text-sm italic">{user.email}</span>
                      </div>
                      <span className="text-[9px] font-black text-gray-400 uppercase bg-gray-200 px-2 py-0.5 rounded">Primary</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Account Tenure</label>
                    <div className="px-6 py-5 bg-blue-50/30 rounded-3xl border border-blue-50 font-black text-[#2874f0] text-sm flex items-center gap-3">
                      <i className="fas fa-calendar-check opacity-50"></i>
                      Joined DIGi QuRY on {new Date(user.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-14 flex justify-start">
                    <button 
                      onClick={handleUpdate}
                      disabled={loading}
                      className="bg-[#2874f0] text-white px-12 py-5 rounded-[2rem] font-black text-sm shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/40 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-4"
                    >
                      {loading ? <i className="fas fa-circle-notch fa-spin"></i> : <i className="fas fa-save"></i>}
                      Commit Updates
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'wishlist' && (
              <div className="bg-white rounded-[3rem] p-8 md:p-12 fk-shadow border border-gray-100 transition-all">
                <div className="mb-10 pb-8 border-b border-gray-50">
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight italic">Saved Assets</h2>
                  <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-1">Items currently on your radar</p>
                </div>

                {wishlist.length === 0 ? (
                  <div className="text-center py-24">
                     <div className="w-28 h-28 bg-red-50 text-red-200 rounded-[2.5rem] flex items-center justify-center text-5xl mx-auto mb-8 animate-pulse">
                        <i className="far fa-heart"></i>
                     </div>
                     <h3 className="text-xl font-black text-gray-800">Your wishlist is currently empty</h3>
                     <p className="text-sm text-gray-400 mt-3 mb-10 font-bold max-w-xs mx-auto">Start hearting the best digital assets to build your professional collection!</p>
                     <button 
                      onClick={() => navigate('/')}
                      className="bg-[#2874f0] text-white px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-blue-500/20 active:scale-95 transition-all"
                     >
                      Explore Trending
                     </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {wishlist.map((item) => {
                      const inCart = isInCart(item.id);
                      return (
                        <div key={item.id} className="flex gap-5 p-5 bg-gray-50/50 rounded-[2.5rem] border border-gray-100 group hover:bg-white hover:shadow-2xl hover:border-blue-100 transition-all">
                          <div 
                            className="w-28 h-28 bg-white rounded-[2rem] p-3 border border-gray-100 flex-shrink-0 cursor-pointer shadow-sm group-hover:rotate-2 transition-transform" 
                            onClick={() => navigate(`/product/${item.id}`)}
                          >
                            <img src={item.preview_image} className="w-full h-full object-contain" alt={item.title} />
                          </div>
                          <div className="flex-grow flex flex-col justify-between py-1">
                            <div>
                               <h4 
                                className="text-base font-black text-gray-800 line-clamp-1 cursor-pointer hover:text-[#2874f0] transition-colors" 
                                onClick={() => navigate(`/product/${item.id}`)}
                               >
                                {item.title}
                               </h4>
                               <span className="text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded uppercase mt-2 inline-block tracking-widest">{item.category}</span>
                               <p className="text-xl font-black text-[#2874f0] mt-2">₹{item.price}</p>
                            </div>
                            <div className="flex items-center gap-4 mt-4">
                               <button 
                                onClick={() => toggleWishlist(item)}
                                className="text-[10px] font-black uppercase text-red-400 hover:text-red-600 transition-colors"
                               >
                                Remove
                               </button>
                               <button 
                                onClick={() => {
                                  if (inCart) navigate('/cart');
                                  else addToCart(item);
                                }}
                                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-md ${inCart ? 'bg-[#2874f0] text-white' : 'bg-[#fb641b] text-white'}`}
                               >
                                {inCart ? 'In Cart' : 'Add to Cart'}
                               </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'security' && (
              <div className="bg-white rounded-[3rem] p-8 md:p-12 fk-shadow border border-gray-100 transition-all">
                <div className="mb-10 pb-8 border-b border-gray-50">
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight italic uppercase">Account Vault</h2>
                  <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-1">Data security and credentials management</p>
                </div>

                <div className="space-y-10">
                  {/* Password Update Form */}
                  <div className="bg-gray-50/50 rounded-[2.5rem] p-8 border border-gray-100">
                    <div className="flex items-center gap-4 mb-8">
                       <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center text-xl shadow-inner border border-amber-100">
                          <i className="fas fa-key"></i>
                       </div>
                       <div>
                          <h3 className="text-base font-black text-gray-900 tracking-tight">Access Credentials</h3>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Last updated: Recently</p>
                       </div>
                    </div>
                    
                    {isChangingPassword ? (
                      <form onSubmit={handlePasswordUpdate} className="space-y-5 max-w-md">
                        <div className="grid grid-cols-1 gap-4">
                          <input 
                            type="password"
                            required
                            placeholder="New Secure Password"
                            value={passwordData.newPassword}
                            onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                            className="w-full px-6 py-5 bg-white border border-gray-100 rounded-3xl focus:border-[#2874f0] focus:ring-4 focus:ring-blue-50 outline-none font-bold text-sm shadow-sm"
                          />
                          <input 
                            type="password"
                            required
                            placeholder="Repeat Secure Password"
                            value={passwordData.confirmPassword}
                            onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                            className="w-full px-6 py-5 bg-white border border-gray-100 rounded-3xl focus:border-[#2874f0] focus:ring-4 focus:ring-blue-50 outline-none font-bold text-sm shadow-sm"
                          />
                        </div>
                        <div className="flex gap-4 pt-4">
                          <button 
                            type="submit"
                            disabled={loading}
                            className="bg-[#2874f0] text-white px-10 py-4 rounded-2xl font-black text-xs uppercase shadow-2xl shadow-blue-500/20 active:scale-95 transition-all"
                          >
                            {loading ? 'Processing...' : 'Verify & Update'}
                          </button>
                          <button 
                            type="button"
                            onClick={() => setIsChangingPassword(false)}
                            className="px-6 py-4 text-gray-400 font-black text-xs uppercase hover:text-gray-600 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button 
                        onClick={() => setIsChangingPassword(true)}
                        className="bg-white px-10 py-4 rounded-2xl border-2 border-dashed border-gray-200 text-[#2874f0] font-black text-xs uppercase tracking-widest hover:border-[#2874f0] hover:bg-blue-50 transition-all"
                      >
                        Change Account Password
                      </button>
                    )}
                  </div>

                  {/* Trust Center */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col p-6 bg-emerald-50/50 rounded-[2rem] border border-emerald-100">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-xl shadow-emerald-500/10">
                          <i className="fas fa-shield-heart text-xl"></i>
                        </div>
                        <h4 className="font-black text-emerald-900 text-sm tracking-tight">Active Protection</h4>
                      </div>
                      <p className="text-[11px] text-emerald-700/70 font-bold leading-relaxed">
                        Your account is currently protected by DIGi QuRY's real-time digital asset monitoring.
                      </p>
                      <span className="mt-6 text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-white px-3 py-1 rounded-full w-fit">Status: Secured</span>
                    </div>

                    <div className="flex flex-col p-6 bg-red-50/50 rounded-[2rem] border border-red-100">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-red-500 shadow-xl shadow-red-500/10">
                          <i className="fas fa-user-xmark text-xl"></i>
                        </div>
                        <h4 className="font-black text-red-900 text-sm tracking-tight">Danger Zone</h4>
                      </div>
                      <p className="text-[11px] text-red-700/70 font-bold leading-relaxed">
                        Deactivating your account will result in permanent loss of access to all purchased digital assets.
                      </p>
                      <button 
                        onClick={() => toast.error("Account deactivation requires manual support review.")}
                        className="mt-6 text-[9px] font-black text-red-600 uppercase tracking-widest hover:underline text-left"
                      >
                        Initiate Closure
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}



          </div>
        </div>
      </div>
    </div>
  );
};


