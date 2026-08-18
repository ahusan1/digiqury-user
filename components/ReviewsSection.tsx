import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../App.tsx';
import { supabase } from '../lib/supabase.ts';
import { toast } from 'react-hot-toast';

interface Review {
  id: string;
  user_id: string;
  product_id: string;
  rating: number;
  comment: string;
  created_at: string;
  user_name?: string;
}

interface Props {
  productId: string;
}

const StarRating: React.FC<{ value: number; onChange?: (v: number) => void; readonly?: boolean }> = ({
  value, onChange, readonly = false
}) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map(star => (
      <button
        key={star}
        type="button"
        disabled={readonly}
        onClick={() => onChange?.(star)}
        className={`text-lg transition-transform ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110 active:scale-95'} ${
          star <= value ? 'text-[#ff9f00]' : 'text-gray-300 dark:text-gray-600'
        }`}
      >
        <i className="fas fa-star"></i>
      </button>
    ))}
  </div>
);

export const ReviewsSection: React.FC<Props> = ({ productId }) => {
  const { user, isPurchased } = useContext(AuthContext);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [myRating, setMyRating] = useState(5);
  const [myComment, setMyComment] = useState('');
  const [hasReviewed, setHasReviewed] = useState(false);

  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  const hasPurchased = isPurchased(productId);

  const fetchReviews = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('product_reviews')
      .select('id, user_id, product_id, rating, comment, created_at, users(name)')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (data) {
      const mapped = data.map((r: any) => ({
        ...r,
        user_name: r.users?.name || 'Anonymous',
      }));
      setReviews(mapped);
      if (user) {
        setHasReviewed(mapped.some((r: any) => r.user_id === user.id));
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReviews();
  }, [productId, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error('Please login to review'); return; }
    if (!hasPurchased) { toast.error('Purchase this product to review'); return; }
    if (!myComment.trim()) { toast.error('Please write a comment'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('product_reviews').upsert({
      user_id: user.id,
      product_id: productId,
      rating: myRating,
      comment: myComment.trim(),
    }, { onConflict: 'user_id,product_id' });

    if (error) {
      toast.error('Failed to submit review');
    } else {
      toast.success('Review submitted!');
      setMyComment('');
      fetchReviews();
    }
    setSubmitting(false);
  };

  return (
    <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-black text-lg text-gray-900 dark:text-white">
          Ratings & Reviews
        </h3>
        {reviews.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-3xl font-black text-gray-900 dark:text-white">{avgRating.toFixed(1)}</span>
            <div>
              <StarRating value={Math.round(avgRating)} readonly />
              <p className="text-xs text-gray-400 mt-0.5">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        )}
      </div>

      {/* Write Review */}
      {hasPurchased && !hasReviewed && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
          <p className="text-sm font-black text-gray-700 dark:text-gray-200 mb-3">Write Your Review</p>
          <div className="mb-3">
            <StarRating value={myRating} onChange={setMyRating} />
          </div>
          <textarea
            value={myComment}
            onChange={e => setMyComment(e.target.value)}
            rows={3}
            placeholder="Share your experience with this product..."
            className="w-full px-4 py-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#2874f0] resize-none text-gray-800 dark:text-gray-100"
          />
          <button
            type="submit"
            disabled={submitting}
            className="mt-3 bg-[#2874f0] text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#1a5abf] disabled:opacity-50 transition-all"
          >
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </form>
      )}

      {/* Reviews List */}
      {loading ? (
        <div className="text-center py-8">
          <i className="fas fa-circle-notch fa-spin text-[#2874f0] text-2xl"></i>
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <i className="fas fa-star text-4xl mb-3 block opacity-20"></i>
          <p className="text-sm font-bold">No reviews yet. Be the first!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map(review => (
            <div key={review.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#2874f0] rounded-full flex items-center justify-center text-white text-xs font-black">
                    {review.user_name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{review.user_name}</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(review.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <StarRating value={review.rating} readonly />
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{review.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
