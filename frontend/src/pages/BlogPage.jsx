import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, ArrowRight, FileText } from 'lucide-react';
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

const BlogPage = ({ user, logout, cart, settings }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const cartItemCount = useMemo(
    () => (cart || []).reduce((sum, item) => sum + (item.quantity || 0), 0),
    [cart]
  );

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const response = await axiosInstance.get('/blog/posts?published_only=true&limit=100');
        setPosts(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error('Error loading blog posts:', error);
        toast.error('Unable to load blog posts');
      } finally {
        setLoading(false);
      }
    };
    loadPosts();
  }, []);

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">Blog</h1>
            <p className="text-white/70">Latest updates, announcements, and useful tips for customers.</p>
          </div>

          {loading ? (
            <div className="text-white/70 text-lg">Loading posts...</div>
          ) : posts.length === 0 ? (
            <Card className="glass-effect border-white/20">
              <CardContent className="p-8 text-center">
                <FileText className="mx-auto text-white/60 mb-3" size={36} />
                <p className="text-white/80">No blog posts published yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {posts.map((post) => {
                const excerpt = post.excerpt || String(post.content || '').slice(0, 180);
                const publishDate = formatDate(post.published_at || post.created_at);
                return (
                  <Card key={post.id} className="glass-effect border-white/20 overflow-hidden">
                    {post.cover_image_url && (
                      <div className="h-44 bg-gray-900">
                        <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <CardContent className="p-5">
                      <h2 className="text-xl font-bold text-white mb-2">{post.title}</h2>
                      {publishDate && (
                        <p className="text-white/60 text-xs mb-3 flex items-center gap-2">
                          <Calendar size={14} />
                          {publishDate}
                        </p>
                      )}
                      <p className="text-white/80 text-sm leading-6 mb-4 line-clamp-3">{excerpt}</p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {(post.tags || []).slice(0, 4).map((tag) => (
                          <span key={`${post.id}-${tag}`} className="text-xs rounded-full px-2 py-1 bg-white/10 text-white/80">
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <Link to={`/blog/${post.id}`}>
                        <Button className="gradient-button text-white w-full">
                          Read more <ArrowRight size={16} className="ml-2" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default BlogPage;

