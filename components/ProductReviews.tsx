import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App';
import { supabase, robustFetch } from '../lib/supabase';
import { Review, Product } from '../types';
import toast from 'react-hot-toast';

interface ProductReviewsProps {
  productId: string;
}

export const ProductReviews: React.FC<ProductReviewsProps> = ({ productId }) => {
  const { user, isPurchased } = useContext(AuthContext);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [productStats, setProductStats] = useState<Partial<Product> | null>(null);
  const [loading, setLoading] = useState(true);
  const [userReview, setUserReview] = useState<Review | null>(null);
  
  // Votes state: map of review_id -> vote (1 for helpful, -1 for not)
  const [userVotes, setUserVotes] = useState<Record<string, number>>({});
  
  // Form state
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Product Stats
      const { data: prodData } = await robustFetch<Product>(
        supabase
          .from('products')
          .select('average_rating, review_count, rating_1_count, rating_2_count, rating_3_count, rating_4_count, rating_5_count')
          .eq('id', productId)
          .single()
      );
      if (prodData) {
         setProductStats(prodData);
      }

      // 2. Fetch Reviews
      const { data: revData, error: revError } = await robustFetch<Review[]>(
        supabase
          .from('product_reviews')
          .select(`
            id, product_id, user_id, rating, title, comment, helpful_count, not_helpful_count, created_at, updated_at,
            user:users!user_id (id, name)
          `)
          .eq('product_id', productId)
          .order('created_at', { ascending: false })
      );

      if (revError) throw revError;
      setReviews(revData || []);
      
      if (user && revData) {
        const myReview = revData.find(r => r.user_id === user.id);
        if (myReview) {
          setUserReview(myReview);
          setRating(myReview.rating);
          setTitle(myReview.title || '');
          setComment(myReview.comment || '');
        }

        // 3. Fetch User Votes
        const reviewIds = revData.map(r => r.id);
        if (reviewIds.length > 0) {
            const { data: voteData } = await robustFetch<any[]>(
                supabase
                    .from('review_votes')
                    .select('review_id, vote')
                    .eq('user_id', user.id)
                    .in('review_id', reviewIds)
            );
            if (voteData) {
                const votesMap: Record<string, number> = {};
                voteData.forEach(v => {
                    votesMap[v.review_id] = v.vote;
                });
                setUserVotes(votesMap);
            }
        }
      }
    } catch (err: any) {
      console.error('Error fetching reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [productId, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSubmitting(true);
    try {
      const payload = {
        product_id: productId,
        user_id: user.id,
        rating,
        title: title.trim() || null,
        comment: comment.trim() || null
      };

      if (userReview) {
        const { error } = await supabase.from('product_reviews').update(payload).eq('id', userReview.id);
        if (error) throw error;
        toast.success('Review updated successfully!');
      } else {
        const { error } = await supabase.from('product_reviews').insert(payload);
        if (error) throw error;
        toast.success('Review submitted successfully!');
      }
      
      setIsEditing(false);
      fetchData(); // Refresh to get new distributions and reviews
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!userReview) return;
    if (!window.confirm('Are you sure you want to delete your review?')) return;
    
    try {
      const { error } = await supabase.from('product_reviews').delete().eq('id', userReview.id);
      if (error) throw error;
      toast.success('Review deleted');
      setUserReview(null);
      setRating(5);
      setTitle('');
      setComment('');
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to delete review');
    }
  };

  const handleVote = async (reviewId: string, voteType: 1 | -1) => {
      if (!user) {
          toast.error("Please login to vote");
          return;
      }

      const currentVote = userVotes[reviewId];
      try {
          if (currentVote === voteType) {
              // Toggle off
              await supabase.from('review_votes').delete().eq('review_id', reviewId).eq('user_id', user.id);
              setUserVotes(prev => { const next = {...prev}; delete next[reviewId]; return next; });
          } else {
              // Upsert vote
              await supabase.from('review_votes').upsert({
                  review_id: reviewId,
                  user_id: user.id,
                  vote: voteType
              }, { onConflict: 'review_id,user_id' });
              setUserVotes(prev => ({...prev, [reviewId]: voteType}));
          }
          // The trigger updates the counts, so we can re-fetch to see them, or optimistically update
          // We will optimistically fetch data silently to stay in sync
          setTimeout(fetchData, 1000);
      } catch(err) {
          toast.error("Failed to register vote");
      }
  };

  const canReview = user && isPurchased(productId);

  const getRatingColor = (r: number) => {
      if (r >= 4) return 'bg-green-600';
      if (r === 3) return 'bg-yellow-500';
      return 'bg-red-500';
  };

  // Histogram calculations
  const totalR = productStats?.review_count || 0;
  const counts = [
      productStats?.rating_5_count || 0,
      productStats?.rating_4_count || 0,
      productStats?.rating_3_count || 0,
      productStats?.rating_2_count || 0,
      productStats?.rating_1_count || 0,
  ];

  return (
    <div className="mt-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-6 border-b border-gray-200">
        <h3 className="text-2xl font-bold text-gray-900">Ratings & Reviews</h3>
        {canReview && (!userReview || isEditing) && (
            <button 
               onClick={() => {
                   if (!isEditing && userReview) setIsEditing(true);
                   document.getElementById('review-form')?.scrollIntoView({ behavior: 'smooth' });
               }}
               className="mt-4 md:mt-0 px-6 py-2.5 bg-white border border-gray-300 rounded-sm font-semibold shadow-sm text-gray-800 hover:bg-gray-50 transition-colors"
            >
               Rate Product
            </button>
        )}
      </div>

      {/* Ratings Distribution Summary */}
      {(totalR > 0) && (
        <div className="flex flex-col md:flex-row gap-8 mb-10">
           <div className="flex flex-col items-center justify-center min-w-[150px]">
               <div className="flex items-center justify-center text-4xl font-light text-gray-900">
                   {Number(productStats?.average_rating || 0).toFixed(1)} <i className="fas fa-star text-3xl ml-1 mb-1"></i>
               </div>
               <p className="text-gray-500 text-sm mt-2 text-center">
                   {totalR} Ratings &<br/>{reviews.filter(r => r.comment || r.title).length} Reviews
               </p>
           </div>
           
           <div className="flex-grow max-w-md border-l md:border-gray-200 md:pl-8">
              {[5, 4, 3, 2, 1].map((star, idx) => {
                  const count = counts[idx];
                  const percentage = totalR > 0 ? (count / totalR) * 100 : 0;
                  return (
                      <div key={star} className="flex items-center gap-3 text-xs text-gray-700 mb-1">
                          <div className="w-6 text-right font-medium">{star} <i className="fas fa-star text-[10px] text-gray-400"></i></div>
                          <div className="flex-grow h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${getRatingColor(star)}`} style={{ width: `${percentage}%` }}></div>
                          </div>
                          <div className="w-8 text-left text-gray-400">{count}</div>
                      </div>
                  )
              })}
           </div>
        </div>
      )}
      
      {/* Review Form */}
      {canReview && (!userReview || isEditing) && (
        <div id="review-form" className="bg-white rounded-sm p-6 mb-10 border border-gray-200 shadow-sm">
          <h4 className="text-lg font-medium text-gray-900 mb-5">{userReview ? 'Edit Your Review' : 'Rate this product'}</h4>
          <form onSubmit={handleSubmit}>
            <div className="mb-5">
              <div className="flex gap-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="focus:outline-none transition-transform hover:scale-110"
                  >
                    <i className={`fas fa-star text-3xl ${star <= rating ? 'text-yellow-400 drop-shadow-sm' : 'text-gray-200'}`}></i>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Review Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-sm focus:ring-1 focus:ring-[#2874f0] focus:border-[#2874f0] text-sm outline-none"
                placeholder="Review headline"
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Description</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-sm focus:ring-1 focus:ring-[#2874f0] focus:border-[#2874f0] text-sm outline-none resize-y"
                placeholder="Description"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-8 py-3 bg-[#fb641b] text-white rounded-sm hover:bg-[#f05a10] font-semibold transition disabled:opacity-50 shadow-sm"
              >
                {submitting ? 'Submitting...' : 'SUBMIT'}
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-8 py-3 bg-white border border-gray-300 text-gray-700 rounded-sm hover:bg-gray-50 font-semibold transition"
                >
                  CANCEL
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* User's existing review summary (if not editing) */}
      {userReview && !isEditing && (
        <div className="bg-gray-50 rounded-sm p-5 mb-8 border border-gray-200">
          <div className="flex justify-between items-start mb-3 border-b border-gray-200 pb-3">
            <h4 className="font-semibold text-gray-800">Your Review</h4>
            <div className="flex gap-4">
              <button 
                onClick={() => setIsEditing(true)}
                className="text-[#2874f0] hover:underline text-sm font-medium flex items-center gap-1"
              >
                <i className="fas fa-pen text-xs"></i> Edit
              </button>
              <button 
                onClick={handleDelete}
                className="text-gray-500 hover:text-red-600 text-sm font-medium flex items-center gap-1 transition-colors"
              >
                <i className="fas fa-trash text-xs"></i> Delete
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-2">
              <div className={`px-2 py-0.5 rounded text-white text-[11px] font-bold flex items-center gap-1 ${getRatingColor(userReview.rating)}`}>
                  {userReview.rating} <i className="fas fa-star text-[9px]"></i>
              </div>
              {userReview.title && <h5 className="font-semibold text-gray-900 text-sm">{userReview.title}</h5>}
          </div>
          {userReview.comment && (
            <p className="text-gray-700 text-sm leading-relaxed mt-2 whitespace-pre-wrap">{userReview.comment}</p>
          )}
        </div>
      )}

      {/* Reviews List */}
      {loading ? (
        <div className="py-12 text-center text-gray-500">
          <i className="fas fa-circle-notch fa-spin text-2xl text-[#2874f0]"></i>
        </div>
      ) : reviews.length > 0 ? (
        <div className="space-y-6">
          {reviews.filter(r => r.id !== userReview?.id).map((review) => (
            <div key={review.id} className="border-b border-gray-200 pb-6 last:border-0">
              <div className="flex items-center gap-3 mb-3">
                  <div className={`px-1.5 py-0.5 rounded-sm text-white text-[11px] font-bold flex items-center gap-1 ${getRatingColor(review.rating)}`}>
                      {review.rating} <i className="fas fa-star text-[8px]"></i>
                  </div>
                  {review.title && <h5 className="font-semibold text-gray-900 text-sm">{review.title}</h5>}
              </div>

              {review.comment && (
                <p className="text-gray-800 text-sm leading-relaxed mb-4 whitespace-pre-wrap">{review.comment}</p>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500 font-medium mt-4">
                  <div className="flex items-center gap-3">
                      <span>{review.user?.name || 'Customer'}</span>
                      <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                      <span className="flex items-center gap-1 text-gray-400">
                          <i className="fas fa-check-circle text-gray-400"></i> Certified Buyer
                      </span>
                      <span className="w-1 h-1 rounded-full bg-gray-300 hidden sm:block"></span>
                      <span className="hidden sm:inline">{new Date(review.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  
                  <div className="flex items-center gap-4">
                      <button 
                         onClick={() => handleVote(review.id, 1)}
                         className={`flex items-center gap-1.5 transition-colors ${userVotes[review.id] === 1 ? 'text-[#2874f0]' : 'hover:text-gray-700'}`}
                      >
                          <i className={`${userVotes[review.id] === 1 ? 'fas' : 'far'} fa-thumbs-up text-sm`}></i>
                          <span>{review.helpful_count || 0}</span>
                      </button>
                      <button 
                         onClick={() => handleVote(review.id, -1)}
                         className={`flex items-center gap-1.5 transition-colors ${userVotes[review.id] === -1 ? 'text-red-500' : 'hover:text-gray-700'}`}
                      >
                          <i className={`${userVotes[review.id] === -1 ? 'fas' : 'far'} fa-thumbs-down text-sm`}></i>
                          <span className="hidden sm:inline">{review.not_helpful_count || 0}</span>
                      </button>
                  </div>
              </div>
            </div>
          ))}
          {reviews.length === 1 && userReview && (
             <div className="text-center text-gray-400 text-sm py-10 bg-gray-50 rounded-sm border border-gray-100">
               You are the only one who has reviewed this product so far.
             </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16 bg-gray-50 border border-gray-100 rounded-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
              <i className="far fa-star text-2xl text-gray-300"></i>
          </div>
          <p className="text-gray-600 font-medium">No reviews yet</p>
          <p className="text-gray-400 text-sm mt-1">{canReview ? 'Share your experience to help others' : 'Buy this product and write the first review'}</p>
        </div>
      )}
    </div>
  );
};
