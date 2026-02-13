import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const formatDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const BlogDetailPage = ({ user, logout, cart, settings }) => {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const cartItemCount = useMemo(
    () => (cart || []).reduce((sum, item) => sum + (item.quantity || 0), 0),
    [cart]
  );

  useEffect(() => {
    const loadPost = async () => {
      try {
        const response = await axiosInstance.get(`/blog/posts/${id}`);
        setPost(response.data || null);
      } catch (error) {
        console.error('Error loading blog post:', error);
        toast.error('Blog post not found');
      } finally {
        setLoading(false);
      }
    };
    loadPost();
  }, [id]);

  const publishDate = formatDate(post?.published_at || post?.created_at);

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <Link to="/blog">
            <Button variant="outline" className="mb-6 border-white/30 text-white hover:bg-white/10">
              <ArrowLeft size={16} className="mr-2" />
              Back to blog
            </Button>
          </Link>

          {loading ? (
            <div className="text-white/70 text-lg">Loading post...</div>
          ) : !post ? (
            <Card className="glass-effect border-white/20">
              <CardContent className="p-8 text-white/80">This blog post is not available.</CardContent>
            </Card>
          ) : (
            <Card className="glass-effect border-white/20 overflow-hidden">
              {post.cover_image_url && (
                <div className="h-64 md:h-80 bg-gray-900">
                  <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-6 md:p-8">
                <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">{post.title}</h1>
                {publishDate && (
                  <p className="text-white/60 text-sm mb-4 flex items-center gap-2">
                    <Calendar size={14} />
                    {publishDate}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mb-6">
                  {(post.tags || []).map((tag) => (
                    <span key={`${post.id}-${tag}`} className="text-xs rounded-full px-2 py-1 bg-white/10 text-white/80">
                      #{tag}
                    </span>
                  ))}
                </div>
                <div className="text-white/90 leading-7 whitespace-pre-wrap">
                  {post.content}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default BlogDetailPage;

