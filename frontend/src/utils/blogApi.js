import { axiosInstance } from '../App';

const FALLBACK_BLOG_KEY = '__blog_posts_v1';

const slugify = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'post';

const toTagsArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const nowIso = () => new Date().toISOString();

const stripHtml = (value = '') =>
  String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|section|article|blockquote|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePost = (raw = {}) => {
  const title = String(raw.title || '').trim();
  const content = String(raw.content || '').trim();
  const plainContent = stripHtml(content);
  const excerptValue = raw.excerpt != null ? stripHtml(raw.excerpt) : '';
  const excerpt = excerptValue || (plainContent.length > 180 ? `${plainContent.slice(0, 177).trim()}...` : plainContent);
  const slug = slugify(raw.slug || title || raw.id || 'post');
  return {
    id: String(raw.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    slug,
    title,
    excerpt,
    content,
    cover_image_url: raw.cover_image_url ? String(raw.cover_image_url).trim() : null,
    tags: toTagsArray(raw.tags),
    seo_title: raw.seo_title ? String(raw.seo_title).trim() : null,
    seo_description: raw.seo_description ? stripHtml(raw.seo_description) : excerpt,
    cta_label: raw.cta_label ? String(raw.cta_label).trim() : null,
    cta_url: raw.cta_url ? String(raw.cta_url).trim() : null,
    published: Boolean(raw.published),
    published_at: raw.published_at || null,
    created_at: raw.created_at || nowIso(),
    updated_at: raw.updated_at || nowIso(),
  };
};

const sortPosts = (posts = []) =>
  [...posts].sort((a, b) => {
    const aTime = Date.parse(a.published_at || a.created_at || 0) || 0;
    const bTime = Date.parse(b.published_at || b.created_at || 0) || 0;
    return bTime - aTime;
  });

const isMissingBlogApi = (error) => {
  const status = error?.response?.status;
  return status === 404 || status === 405;
};

const readFallbackPosts = async () => {
  const settingsResp = await axiosInstance.get('/settings');
  const socialLinks = settingsResp?.data?.social_links || {};
  const rawValue = socialLinks[FALLBACK_BLOG_KEY];
  if (!rawValue) return [];

  try {
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    if (!Array.isArray(parsed)) return [];
    return sortPosts(parsed.map(normalizePost));
  } catch (_e) {
    return [];
  }
};

const writeFallbackPosts = async (posts = []) => {
  const normalized = sortPosts(posts.map(normalizePost));
  const settingsResp = await axiosInstance.get('/settings');
  const currentSocialLinks = settingsResp?.data?.social_links || {};
  const nextSocialLinks = {
    ...currentSocialLinks,
    [FALLBACK_BLOG_KEY]: JSON.stringify(normalized),
  };
  await axiosInstance.put('/settings', { social_links: nextSocialLinks });
  return normalized;
};

const ensureUniqueSlug = (posts, slug, currentId = null) => {
  const base = slugify(slug);
  let candidate = base;
  let idx = 2;
  const taken = new Set(
    (posts || [])
      .filter((post) => String(post.id) !== String(currentId || ''))
      .map((post) => slugify(post.slug || post.title || post.id))
  );
  while (taken.has(candidate)) {
    candidate = `${base}-${idx}`;
    idx += 1;
  }
  return candidate;
};

let _staticBlogCache = null;
const loadStaticBlog = async () => {
  if (_staticBlogCache) return _staticBlogCache;
  try {
    const resp = await fetch('/blog-data.json');
    if (!resp.ok) return [];
    const data = await resp.json();
    _staticBlogCache = Array.isArray(data) ? data.map(normalizePost) : [];
    return _staticBlogCache;
  } catch { return []; }
};

export const listBlogPosts = async ({ publishedOnly = true, limit = 100 } = {}) => {
  try {
    const response = await axiosInstance.get(`/blog/posts?published_only=${publishedOnly ? 'true' : 'false'}&limit=${limit}`);
    const posts = Array.isArray(response.data) ? response.data.map(normalizePost) : [];
    return { posts: sortPosts(posts), source: 'api' };
  } catch (error) {
    const staticPosts = await loadStaticBlog();
    if (staticPosts.length > 0) {
      const filtered = publishedOnly ? staticPosts.filter((p) => p.published !== false) : staticPosts;
      return { posts: sortPosts(filtered).slice(0, Math.max(1, Number(limit) || 100)), source: 'static' };
    }
    if (!isMissingBlogApi(error)) throw error;
    const fallback = await readFallbackPosts();
    const filtered = publishedOnly ? fallback.filter((post) => post.published) : fallback;
    return { posts: filtered.slice(0, Math.max(1, Number(limit) || 100)), source: 'fallback' };
  }
};

export const getBlogPostBySlugOrId = async (slugOrId) => {
  const encoded = encodeURIComponent(slugOrId);
  try {
    const bySlug = await axiosInstance.get(`/blog/posts/by-slug/${encoded}`);
    return { post: normalizePost(bySlug.data), source: 'api' };
  } catch (error) {
    if (!isMissingBlogApi(error)) {
      try {
        const byId = await axiosInstance.get(`/blog/posts/${encoded}`);
        return { post: normalizePost(byId.data), source: 'api' };
      } catch (secondaryError) {
        if (!isMissingBlogApi(secondaryError)) {
          /* fall through to static */
        }
      }
    }
    const staticPosts = await loadStaticBlog();
    const key = String(slugOrId || '').trim().toLowerCase();
    const staticFound = staticPosts.find(
      (post) => (post.slug || '').toLowerCase() === key || (post.id || '').toLowerCase() === key || slugify(post.slug || post.title || post.id) === slugify(key)
    );
    if (staticFound) return { post: normalizePost(staticFound), source: 'static' };

    const fallback = await readFallbackPosts();
    const found = fallback.find(
      (post) => post.id.toLowerCase() === key || slugify(post.slug || post.title || post.id) === slugify(key)
    );
    if (!found || !found.published) {
      throw new Error('Blog post not found');
    }
    return { post: normalizePost(found), source: 'fallback' };
  }
};

export const createBlogPost = async (payload) => {
  try {
    const response = await axiosInstance.post('/blog/posts', payload);
    return { post: normalizePost(response.data), source: 'api' };
  } catch (error) {
    if (!isMissingBlogApi(error)) throw error;
    const existing = await readFallbackPosts();
    const normalizedPayload = normalizePost({
      ...payload,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      created_at: nowIso(),
      updated_at: nowIso(),
      published_at: payload?.published ? nowIso() : null,
    });
    normalizedPayload.slug = ensureUniqueSlug(existing, payload?.slug || payload?.title, normalizedPayload.id);
    const next = sortPosts([normalizedPayload, ...existing]);
    const saved = await writeFallbackPosts(next);
    const created = saved.find((post) => post.id === normalizedPayload.id) || normalizedPayload;
    return { post: created, source: 'fallback' };
  }
};

export const updateBlogPost = async (postId, payload) => {
  try {
    const response = await axiosInstance.put(`/blog/posts/${postId}`, payload);
    return { post: normalizePost(response.data), source: 'api' };
  } catch (error) {
    if (!isMissingBlogApi(error)) throw error;
    const existing = await readFallbackPosts();
    const idx = existing.findIndex((post) => String(post.id) === String(postId));
    if (idx < 0) {
      throw new Error('Blog post not found');
    }
    const current = normalizePost(existing[idx]);
    const merged = normalizePost({
      ...current,
      ...payload,
      id: current.id,
      updated_at: nowIso(),
    });
    merged.slug = ensureUniqueSlug(existing, payload?.slug || merged.slug || merged.title, merged.id);
    if (payload?.published === true && !current.published) {
      merged.published_at = nowIso();
    }
    if (payload?.published === false) {
      merged.published_at = null;
    }
    const next = [...existing];
    next[idx] = merged;
    const saved = await writeFallbackPosts(next);
    const updated = saved.find((post) => post.id === merged.id) || merged;
    return { post: updated, source: 'fallback' };
  }
};

export const deleteBlogPost = async (postId) => {
  try {
    await axiosInstance.delete(`/blog/posts/${postId}`);
    return { source: 'api' };
  } catch (error) {
    if (!isMissingBlogApi(error)) throw error;
    const existing = await readFallbackPosts();
    const next = existing.filter((post) => String(post.id) !== String(postId));
    await writeFallbackPosts(next);
    return { source: 'fallback' };
  }
};

