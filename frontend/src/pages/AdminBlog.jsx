import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { listBlogPosts, createBlogPost, updateBlogPost, deleteBlogPost } from '../utils/blogApi';

const EMPTY_FORM = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  cover_image_url: '',
  tags: '',
  seo_title: '',
  seo_description: '',
  cta_label: '',
  cta_url: '',
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
  const [editorMode, setEditorMode] = useState('write');
  const [dataSource, setDataSource] = useState('api');

  const cartItemCount = useMemo(() => 0, []);

  const loadPosts = async () => {
    try {
      const result = await listBlogPosts({ publishedOnly: false, limit: 300 });
      setPosts(result.posts || []);
      setDataSource(result.source || 'api');
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
    setEditorMode('write');
  };

  const startEdit = (post) => {
    setEditingId(post.id);
    setFormData({
      title: post.title || '',
      slug: post.slug || '',
      excerpt: post.excerpt || '',
      content: post.content || '',
      cover_image_url: post.cover_image_url || '',
      tags: Array.isArray(post.tags) ? post.tags.join(', ') : '',
      seo_title: post.seo_title || '',
      seo_description: post.seo_description || '',
      cta_label: post.cta_label || '',
      cta_url: post.cta_url || '',
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
      slug: formData.slug.trim() || null,
      excerpt: formData.excerpt.trim() || null,
      content: formData.content.trim(),
      cover_image_url: formData.cover_image_url.trim() || null,
      tags: toTagsArray(formData.tags),
      seo_title: formData.seo_title.trim() || null,
      seo_description: formData.seo_description.trim() || null,
      cta_label: formData.cta_label.trim() || null,
      cta_url: formData.cta_url.trim() || null,
      published: Boolean(formData.published),
    };

    setSaving(true);
    try {
      if (editingId) {
        const result = await updateBlogPost(editingId, payload);
        if (result?.source) setDataSource(result.source);
        toast.success('Blog post updated');
      } else {
        const result = await createBlogPost(payload);
        if (result?.source) setDataSource(result.source);
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
      const result = await deleteBlogPost(post.id);
      if (result?.source) setDataSource(result.source);
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

  const contentWordCount = String(formData.content || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const estimatedReadMinutes = Math.max(1, Math.ceil(contentWordCount / 200));

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={cartItemCount} settings={settings} />
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white">Manage Blog</h1>
              <p className="text-white/70 mt-1">Publish updates and information for your customers.</p>
              {dataSource === 'fallback' && (
                <p className="text-yellow-300 text-xs mt-1">
                  Compatibility mode active: primary blog API unavailable, using settings storage fallback.
                </p>
              )}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <Label className="text-white">SEO Slug (optional)</Label>
                    <Input
                      value={formData.slug}
                      onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white mt-1"
                      placeholder="example-blog-post-title"
                    />
                    <p className="text-white/50 text-xs mt-1">
                      URL preview: /blog/{(formData.slug || formData.title || 'your-post').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'your-post'}
                    </p>
                  </div>
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
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-white">Article Writing Area</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={editorMode === 'write' ? 'default' : 'outline'}
                        className={editorMode === 'write' ? 'gradient-button text-white' : 'border-white/30 text-white hover:bg-white/10'}
                        onClick={() => setEditorMode('write')}
                      >
                        Write
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={editorMode === 'preview' ? 'default' : 'outline'}
                        className={editorMode === 'preview' ? 'gradient-button text-white' : 'border-white/30 text-white hover:bg-white/10'}
                        onClick={() => setEditorMode('preview')}
                      >
                        Preview
                      </Button>
                    </div>
                  </div>
                  {editorMode === 'write' ? (
                    <Textarea
                      value={formData.content}
                      onChange={(e) => setFormData((prev) => ({ ...prev, content: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white mt-1"
                      rows={14}
                      placeholder="Write your full article here..."
                    />
                  ) : (
                    <div className="mt-1 rounded-lg border border-white/10 bg-black/30 p-4 text-white/90 whitespace-pre-wrap min-h-[280px]">
                      {formData.content || 'Your preview will appear here...'}
                    </div>
                  )}
                  <p className="text-white/50 text-xs mt-2">
                    Words: {contentWordCount} • Estimated reading time: {estimatedReadMinutes} min
                  </p>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white">SEO Title (optional)</Label>
                    <Input
                      value={formData.seo_title}
                      onChange={(e) => setFormData((prev) => ({ ...prev, seo_title: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white mt-1"
                      placeholder="SEO optimized title"
                    />
                  </div>
                  <div>
                    <Label className="text-white">SEO Description (optional)</Label>
                    <Input
                      value={formData.seo_description}
                      onChange={(e) => setFormData((prev) => ({ ...prev, seo_description: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white mt-1"
                      placeholder="Short SEO description for search engines"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-white">CTA Label (optional)</Label>
                    <Input
                      value={formData.cta_label}
                      onChange={(e) => setFormData((prev) => ({ ...prev, cta_label: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white mt-1"
                      placeholder="Shop now"
                    />
                  </div>
                  <div>
                    <Label className="text-white">CTA URL (optional)</Label>
                    <Input
                      value={formData.cta_url}
                      onChange={(e) => setFormData((prev) => ({ ...prev, cta_url: e.target.value }))}
                      className="bg-white/10 border-white/20 text-white mt-1"
                      placeholder="/products/subscription or https://..."
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
                  Publish immediately (visible on public blog)
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
                      <p className="text-white/50 text-xs mt-1">Slug: {post.slug || '-'}</p>
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
                          <Link to={`/blog/${post.slug || post.id}`} target="_blank" rel="noreferrer">
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

