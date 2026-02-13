import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const EMPTY_FORM = {
  title: '',
  excerpt: '',
  content: '',
  cover_image_url: '',
  tags: '',
  published: false,
};

const toTagsArray = (value = '') =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const formatDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString();
};

const AdminBlog = ({ user, logout, settings }) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const cartItemCount = useMemo(() => 0, []);

  const loadPosts = async () => {
    try {
      const response = await axiosInstance.get('/blog/posts?published_only=false&limit=300');
      setPosts(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading blog posts:', error);
      toast.error('Unable to load blog posts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const startEdit = (post) => {
    setEditingId(post.id);
    setFormData({
      title: post.title || '',
      excerpt: post.excerpt || '',
      content: post.content || '',
      cover_image_url: post.cover_image_url || '',
      tags: Array.isArray(post.tags) ? post.tags.join(', ') : '',
      published: Boolean(post.published),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error('Title and content are required');
      return;
    }

    const payload = {
      title: formData.title.trim(),
      excerpt: formData.excerpt.trim() || null,
      content: formData.content.trim(),
      cover_image_url: formData.cover_image_url.trim() || null,
      tags: toTagsArray(formData.tags),
      published: Boolean(formData.published),
    };

    setSaving(true);
    try {
      if (editingId) {
        await axiosInstance.put(`/blog/posts/${editingId}`, payload);
        toast.success('Blog post updated');
      } else {
        await axiosInstance.post('/blog/posts', payload);
        toast.success('Blog post created');
      }
      resetForm();
      await loadPosts();
    } catch (error) {
      console.error('Error saving blog post:', error);
      toast.error(error.response?.data?.detail || 'Unable to save blog post');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (post) => {
    if (!window.confirm(`Delete "${post.title}"?`)) return;
    try {
      await axiosInstance.delete(`/blog/posts/${post.id}`);
      toast.success('Blog post deleted');
      if (editingId === post.id) {
        resetForm();
      }
      await loadPosts();
    } catch (error) {
      console.error('Error deleting blog post:', error);
      toast.error(error.response?.data?.detail || 'Unable to delete blog post');
    }
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white">Manage Blog</h1>
              <p className="text-white/70 mt-1">Publish updates and information for your customers.</p>
            </div>
            <Link to="/admin">
              <Button className="bg-white text-purple-600 hover:bg-gray-100">Admin Home</Button>
            </Link>
          </div>

          <Card className="glass-effect border-white/20">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                {editingId ? 'Edit Blog Post' : 'Create Blog Post'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-white">Title</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                    className="bg-white/10 border-white/20 text-white mt-1"
                    placeholder="Write a title..."
                  />
                </div>
                <div>
                  <Label className="text-white">Excerpt (short summary)</Label>
                  <Textarea
                    value={formData.excerpt}
                    onChange={(e) => setFormData((prev) => ({ ...prev, excerpt: e.target.value }))}
                    className="bg-white/10 border-white/20 text-white mt-1"
                    rows={2}
                    placeholder="Short summary shown in blog list"
                  />
                </div>
                <div>
                  <Label className="text-white">Content</Label>
                  <Textarea
                    value={formData.content}
                    onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                    className="bg-white/10 border-white/20 text-white mt-1"
                    rows={10}
                    placeholder="Write your full post here..."
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white">Cover Image URL</Label>
                    <Input
                      value={formData.cover_image_url}
                      onChange={(e) => setFormData((prev) => ({ ...prev, cover_image_url: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white mt-1"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <Label className="text-white">Tags (comma separated)</Label>
                    <Input
                      value={formData.tags}
                      onChange={(e) => setFormData((prev) => ({ ...prev, tags: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white mt-1"
                      placeholder="update, promotion, support"
                    />
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-white">
                  <input
                    type="checkbox"
                    checked={formData.published}
                    onChange={(e) => setFormData((prev) => ({ ...prev, published: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  Publish immediately
                </label>

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={saving} className="gradient-button text-white">
                    {saving ? 'Saving...' : editingId ? 'Update Post' : 'Create Post'}
                  </Button>
                  {editingId && (
                    <Button type="button" variant="outline" onClick={resetForm} className="border-white/30 text-white hover:bg-white/10">
                      Cancel Edit
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="glass-effect border-white/20">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">Blog Posts</h2>
              {loading ? (
                <p className="text-white/70">Loading posts...</p>
              ) : posts.length === 0 ? (
                <p className="text-white/70">No posts yet.</p>
              ) : (
                <div className="space-y-3">
                  {posts.map((post) => (
                    <div key={post.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-white font-semibold">{post.title}</h3>
                        <span className={`text-xs px-2 py-1 rounded-full ${post.published ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                          {post.published ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <p className="text-white/60 text-xs mt-1">
                        Updated: {formatDate(post.updated_at)} {post.published_at ? `• Published: ${formatDate(post.published_at)}` : ''}
                      </p>
                      <p className="text-white/75 text-sm mt-2 line-clamp-2">
                        {post.excerpt || String(post.content || '').slice(0, 180)}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Button type="button" size="sm" className="bg-white text-purple-700 hover:bg-gray-200" onClick={() => startEdit(post)}>
                          Edit
                        </Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => handleDelete(post)}>
                          Delete
                        </Button>
                        {post.published && (
                          <Link to={`/blog/${post.id}`} target="_blank" rel="noreferrer">
                            <Button type="button" size="sm" variant="outline" className="border-white/30 text-white hover:bg-white/10">
                              View
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default AdminBlog;

