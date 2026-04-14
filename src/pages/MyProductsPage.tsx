import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Sparkles } from 'lucide-react';
import type { ProductCourse, CourseAccessMode } from '../types/product';
import ProductCard from '../components/ProductCard';
import AddCourseCard from '../components/AddCourseCard';
import CourseCoverArt from '../components/CourseCoverArt';
import {
  createProduct,
  getMyProducts,
  getAuthMe,
  getTeacherCourseStats,
  publishCourse,
  unpublishCourse,
  removeProduct,
  toggleProductStar,
  type TeacherCourseStats,
  updateProduct,
} from '../lib/api';
import { COURSE_TEMPLATES, normalizeCourseTemplate, type CourseTemplateKey } from '../lib/courseTemplates';

const LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
] as const;

type ProductSort = 'title-asc' | 'title-desc' | 'status' | 'starred-first' | 'recently-added';

export default function MyProductsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<ProductSort>('recently-added');
  const [products, setProducts] = useState<ProductCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessChecked, setAccessChecked] = useState(false);
  const [viewerPlan, setViewerPlan] = useState<'free' | 'plus'>('free');
  const [sellerBillingReady, setSellerBillingReady] = useState(false);
  const [connectedAccountStatus, setConnectedAccountStatus] = useState<'not_connected' | 'pending' | 'ready'>('not_connected');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [sharingCourseId, setSharingCourseId] = useState<string | null>(null);
  const [publishingCourseId, setPublishingCourseId] = useState<string | null>(null);
  const [statsCourseId, setStatsCourseId] = useState<string | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');
  const [activeStats, setActiveStats] = useState<TeacherCourseStats | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('History');
  const [level, setLevel] = useState<(typeof LEVELS)[number]['value']>('beginner');
  const [accessMode, setAccessMode] = useState<CourseAccessMode>('public-free');
  const [price, setPrice] = useState('0');
  const [templateKey, setTemplateKey] = useState<CourseTemplateKey>('history');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [removeCoverImage, setRemoveCoverImage] = useState(false);
  const [allowLearnerUploads, setAllowLearnerUploads] = useState(false);
  const [learnerUploadNote, setLearnerUploadNote] = useState('');

  const editingCourse = useMemo(
    () => (editingCourseId ? products.find(item => item.id === editingCourseId) ?? null : null),
    [editingCourseId, products],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const payload = await getAuthMe();
        if (cancelled) return;
        if (payload.user.role === 'Student') {
          navigate('/', { replace: true });
          return;
        }
        setViewerPlan(payload.user.subscriptionPlan === 'plus' ? 'plus' : 'free');
        setSellerBillingReady(Boolean(payload.user.sellerBillingReady));
        setConnectedAccountStatus(payload.user.connectedAccountStatus === 'ready' || payload.user.connectedAccountStatus === 'pending' ? payload.user.connectedAccountStatus : 'not_connected');
        setAccessChecked(true);
      } catch {
        if (!cancelled) {
          navigate('/login', { replace: true });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!accessChecked) return;
    let cancelled = false;

    const timer = setTimeout(() => {
      const run = async () => {
        setLoading(true);
        try {
          const data = await getMyProducts(query);
          if (!cancelled) setProducts(data);
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      void run();
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessChecked, query]);

  async function reload() {
    if (!accessChecked) return;
    setLoading(true);
    try {
      const data = await getMyProducts(query);
      setProducts(data);
    } finally {
      setLoading(false);
    }
  }

  async function toggleStar(id: string) {
    await toggleProductStar(id);
    await reload();
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setCategory('History');
    setLevel('beginner');
    setAccessMode('public-free');
    setPrice('0');
    setTemplateKey('history');
    setCoverFile(null);
    setCoverPreviewUrl('');
    setRemoveCoverImage(false);
    setAllowLearnerUploads(false);
    setLearnerUploadNote('');
    setFormError('');
  }

  function openCreateModal() {
    resetForm();
    setEditingCourseId(null);
    setShowEditModal(false);
    setShowCreateModal(true);
  }

  function openEditModal(course: ProductCourse) {
    setEditingCourseId(course.id);
    setTitle(course.title || '');
    setDescription(course.description || '');
    setCategory(course.category || 'History');
    setLevel((course.level as (typeof LEVELS)[number]['value']) || 'beginner');
    setAccessMode((course.accessMode as CourseAccessMode) || ((course.accessType as 'free' | 'paid') === 'paid' ? 'public-paid' : 'public-free')); 
    setPrice(course.priceCents ? String(course.priceCents / 100) : '0');
    setTemplateKey(normalizeCourseTemplate(course.templateKey, course.category));
    setCoverFile(null);
    setCoverPreviewUrl(course.thumbnailUrl || '');
    setRemoveCoverImage(false);
    setAllowLearnerUploads(Boolean(course.allowLearnerUploads));
    setLearnerUploadNote(course.learnerUploadNote || '');
    setFormError('');
    setShowCreateModal(false);
    setShowEditModal(true);
  }

  function onCoverFileChange(file: File | null) {
    setCoverFile(file);

    if (!file) {
      setCoverPreviewUrl(editingCourse?.thumbnailUrl || '');
      return;
    }

    setRemoveCoverImage(false);
    setCoverPreviewUrl(URL.createObjectURL(file));
  }

  function handleRemoveCover() {
    setCoverFile(null);
    setRemoveCoverImage(true);
    setCoverPreviewUrl('');
  }

  function validateForm() {
    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    const cleanCategory = category.trim();

    if (!cleanTitle) {
      setFormError('Course title is required.');
      return null;
    }

    if (!cleanCategory) {
      setFormError('Category is required.');
      return null;
    }
    const resolvedAccessType: 'free' | 'paid' = accessMode === 'public-paid' ? 'paid' : 'free';
    let priceCents: number | null = null;
    if (accessMode === 'public-paid') {
      if (!sellerBillingReady) {
        setFormError('Connect Stripe payouts in Account before creating or publishing paid courses.');
        return null;
      }
      const numericPrice = Number(price);
      if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        setFormError('Paid course requires a positive price.');
        return null;
      }
      priceCents = Math.round(numericPrice * 100);
    }

    return {
      title: cleanTitle,
      description: cleanDescription,
      category: cleanCategory,
      level,
      accessMode,
      accessType: resolvedAccessType,
      priceCents,
      currency: accessMode === 'public-paid' ? 'PLN' : null,
      templateKey,
      coverImage: coverFile,
      removeCoverImage: Boolean(editingCourseId && removeCoverImage),
      allowLearnerUploads,
      learnerUploadNote: learnerUploadNote.trim(),
    };
  }

  async function submitCreateCourse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');

    const payload = validateForm();
    if (!payload) return;

    setSaving(true);
    try {
      await createProduct(payload);
      setShowCreateModal(false);
      resetForm();
      await reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not create course');
    } finally {
      setSaving(false);
    }
  }

  async function submitEditCourse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError('');

    if (!editingCourseId) {
      setFormError('No course selected to edit.');
      return;
    }

    const payload = validateForm();
    if (!payload) return;

    setSaving(true);
    try {
      await updateProduct(editingCourseId, payload);
      setShowEditModal(false);
      setEditingCourseId(null);
      resetForm();
      await reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not update course');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(course: ProductCourse) {
    const firstCheck = window.confirm(`Delete course "${course.title}"?`);
    if (!firstCheck) return;

    const secondCheck = window.confirm('This removes the course and its lessons. Confirm delete again.');
    if (!secondCheck) return;

    setActionError('');
    setDeletingCourseId(course.id);
    try {
      await removeProduct(course.id);
      await reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete course');
    } finally {
      setDeletingCourseId(null);
    }
  }

  function getPublishBlockedReason(course: ProductCourse) {
    if (course.publishBlocked) {
      return course.publishBlockMessage || 'Publishing this course was blocked by Admin.';
    }

    const courseAccessMode = course.accessMode || (course.accessType === 'paid' ? 'public-paid' : 'public-free');
    if (courseAccessMode === 'public-paid' && !sellerBillingReady) {
      return connectedAccountStatus === 'pending'
        ? 'Finish Stripe onboarding in Account before publishing this paid course.'
        : 'Connect Stripe payouts in Account before publishing this paid course.';
    }
    return '';
  }

  async function handlePublish(course: ProductCourse) {
    if (course.status !== 'Non posted') return;

    const blockedReason = getPublishBlockedReason(course);
    if (blockedReason) {
      setActionError(blockedReason);
      return;
    }

    const publishNote = course.accessMode === 'class-only'
      ? 'It will become available only through assigned classes and stay hidden from Discover.'
      : course.accessMode === 'public-paid'
        ? 'It will appear in Discover and open a Stripe checkout when learners choose Buy access.'
        : 'It will appear in Discover and open for free public enrollment.';
    const confirmed = window.confirm(`Publish course "${course.title}"? ${publishNote}`);
    if (!confirmed) return;

    setActionError('');
    setPublishingCourseId(course.id);
    try {
      await publishCourse(course.id);
      await reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not publish course');
    } finally {
      setPublishingCourseId(null);
    }
  }

  async function handleUnpublish(course: ProductCourse) {
    if (course.status !== 'Published') return;

    const unpublishNote = course.accessMode === 'class-only'
      ? 'It will no longer be available through its assigned classes until you publish it again.'
      : 'It will disappear from Discover and stop accepting new public enrollments.';
    const confirmed = window.confirm(`Unpublish course "${course.title}"? ${unpublishNote}`);
    if (!confirmed) return;

    setActionError('');
    setPublishingCourseId(course.id);
    try {
      await unpublishCourse(course.id);
      await reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not unpublish course');
    } finally {
      setPublishingCourseId(null);
    }
  }

  async function handleShare(course: ProductCourse) {
    const shareUrl = `${window.location.origin}/course/${course.id}`;
    setActionError('');
    setSharingCourseId(course.id);
    try {
      if (navigator.share) {
        await navigator.share({
          title: course.title,
          text: `Check out this course: ${course.title}`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        window.alert('Course link copied to clipboard.');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      setActionError(error instanceof Error ? error.message : 'Could not share course');
    } finally {
      setSharingCourseId(null);
    }
  }

  async function openStatsModal(course: ProductCourse) {
    setStatsCourseId(course.id);
    setShowStatsModal(true);
    setStatsLoading(true);
    setStatsError('');
    setActiveStats(null);
    try {
      const payload = await getTeacherCourseStats(course.id);
      setActiveStats(payload);
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : 'Could not load course statistics');
    } finally {
      setStatsLoading(false);
    }
  }

  function closeStatsModal() {
    setShowStatsModal(false);
    setStatsCourseId(null);
    setStatsLoading(false);
    setStatsError('');
    setActiveStats(null);
  }

  const publishedCoursesCount = useMemo(() => products.filter(product => product.status === 'Published').length, [products]);
  const publishedCoursesLimit = viewerPlan === 'plus' ? 20 : 5;
  const publishedUsagePercent = publishedCoursesLimit > 0 ? Math.round((publishedCoursesCount / publishedCoursesLimit) * 100) : 0;
  const isPublishedLimitReached = publishedCoursesCount >= publishedCoursesLimit;
  const isPublishedNearLimit = !isPublishedLimitReached && publishedUsagePercent >= 80;

  const sortedProducts = useMemo(() => {
    const items = [...products];

    if (sortBy === 'title-asc') {
      items.sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortBy === 'title-desc') {
      items.sort((a, b) => b.title.localeCompare(a.title));
    }
    if (sortBy === 'status') {
      items.sort((a, b) => a.status.localeCompare(b.status));
    }
    if (sortBy === 'starred-first') {
      items.sort((a, b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)));
    }
    if (sortBy === 'recently-added') {
      items.sort((a, b) => Number(b.addedSeq || 0) - Number(a.addedSeq || 0));
    }

    return items;
  }, [products, sortBy]);

  if (!accessChecked) {
    return <section className="min-h-[40vh] grid place-items-center text-sm text-neutral-600">Checking access to My Products...</section>;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-700">
            <Sparkles className="size-3.5" />
            Creator mode
          </div>
          <p className="text-sm text-neutral-600">Build your catalog, edit course cards, and open statistics for every course you created.</p>
          <div className={[
            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em]',
            isPublishedLimitReached ? 'border-red-200 bg-red-50 text-red-700' : isPublishedNearLimit ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-neutral-200 bg-white text-neutral-600',
          ].join(' ')}>
            Published courses {publishedCoursesCount} / {publishedCoursesLimit}
            <span className="normal-case tracking-normal text-neutral-500">{viewerPlan === 'plus' ? 'InteLections+' : 'Free plan'}</span>
          </div>
          {isPublishedLimitReached ? (
            <p className="text-sm text-red-600">You reached the published course limit for your current plan.</p>
          ) : isPublishedNearLimit ? (
            <p className="text-sm text-amber-700">You are getting close to the published course limit for your current plan.</p>
          ) : null}
          <div className={[
            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em]',
            sellerBillingReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : connectedAccountStatus === 'pending' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-neutral-200 bg-white text-neutral-600',
          ].join(' ')}>
            Seller payouts {sellerBillingReady ? 'ready' : connectedAccountStatus === 'pending' ? 'pending' : 'not connected'}
            <span className="normal-case tracking-normal text-neutral-500">Stripe Connect</span>
          </div>
          {!sellerBillingReady ? (
            <p className="text-sm text-neutral-600">
              Connect Stripe in <Link to="/account" className="underline underline-offset-4">Account</Link> before creating or publishing paid courses. Learners will pay through Checkout and InteLections keeps a 1% marketplace fee.
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-w-[260px] items-center gap-2 rounded-full border px-3 py-2">
          <Search className="size-4" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search in My Products"
            className="w-full bg-transparent outline-none"
          />
        </label>

        <label className="flex items-center gap-2 rounded-full border px-3 py-2">
          <span className="text-sm text-neutral-600">Sort</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as ProductSort)}
            className="bg-transparent outline-none"
          >
            <option value="recently-added">Recently added</option>
            <option value="title-asc">Title A-Z</option>
            <option value="title-desc">Title Z-A</option>
            <option value="status">Status</option>
            <option value="starred-first">Favourites first</option>
          </select>
        </label>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Action failed: {actionError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-600">Loading products...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedProducts.map(p => (
            <ProductCard
              key={p.id}
              course={p}
              onToggleStar={toggleStar}
              onEdit={openEditModal}
              onDelete={handleDelete}
              onShare={handleShare}
              onStatistics={openStatsModal}
              onPublish={handlePublish}
              onUnpublish={handleUnpublish}
              publishBlockedReason={getPublishBlockedReason(p)}
              deleting={deletingCourseId === p.id}
              sharing={sharingCourseId === p.id}
              publishing={publishingCourseId === p.id}
              openingStats={statsCourseId === p.id && statsLoading}
            />
          ))}
          <AddCourseCard onClick={openCreateModal} />
        </div>
      )}

      {showCreateModal && (
        <CourseFormModal
          titleText="Create Course"
          submitText={saving ? 'Creating...' : 'Create Course'}
          onClose={() => setShowCreateModal(false)}
          onSubmit={submitCreateCourse}
          formError={formError}
          saving={saving}
          title={title}
          setTitle={setTitle}
          description={description}
          setDescription={setDescription}
          category={category}
          setCategory={setCategory}
          level={level}
          setLevel={setLevel}
          accessMode={accessMode}
          setAccessMode={setAccessMode}
          price={price}
          setPrice={setPrice}
          templateKey={templateKey}
          setTemplateKey={setTemplateKey}
          coverPreviewUrl={coverPreviewUrl}
          onCoverFileChange={onCoverFileChange}
          isEditing={false}
          hasExistingCover={Boolean(coverPreviewUrl)}
          removeCoverImage={removeCoverImage}
          onRemoveCover={handleRemoveCover}
          allowLearnerUploads={allowLearnerUploads}
          setAllowLearnerUploads={setAllowLearnerUploads}
          learnerUploadNote={learnerUploadNote}
          setLearnerUploadNote={setLearnerUploadNote}
          sellerBillingReady={sellerBillingReady}
          connectedAccountStatus={connectedAccountStatus}
        />
      )}

      {showEditModal && (
        <CourseFormModal
          titleText="Edit course card"
          submitText={saving ? 'Saving...' : 'Save Changes'}
          onClose={() => setShowEditModal(false)}
          onSubmit={submitEditCourse}
          formError={formError}
          saving={saving}
          title={title}
          setTitle={setTitle}
          description={description}
          setDescription={setDescription}
          category={category}
          setCategory={setCategory}
          level={level}
          setLevel={setLevel}
          accessMode={accessMode}
          setAccessMode={setAccessMode}
          price={price}
          setPrice={setPrice}
          templateKey={templateKey}
          setTemplateKey={setTemplateKey}
          coverPreviewUrl={coverPreviewUrl}
          onCoverFileChange={onCoverFileChange}
          isEditing
          hasExistingCover={Boolean(editingCourse?.thumbnailUrl) && !removeCoverImage}
          removeCoverImage={removeCoverImage}
          onRemoveCover={handleRemoveCover}
          allowLearnerUploads={allowLearnerUploads}
          setAllowLearnerUploads={setAllowLearnerUploads}
          learnerUploadNote={learnerUploadNote}
          setLearnerUploadNote={setLearnerUploadNote}
          sellerBillingReady={sellerBillingReady}
          connectedAccountStatus={connectedAccountStatus}
        />
      )}

      {showStatsModal && (
        <CourseStatsModal
          loading={statsLoading}
          error={statsError}
          stats={activeStats}
          onClose={closeStatsModal}
        />
      )}
    </section>
  );
}

function CourseFormModal({
  titleText,
  submitText,
  onClose,
  onSubmit,
  formError,
  saving,
  title,
  setTitle,
  description,
  setDescription,
  category,
  setCategory,
  level,
  setLevel,
  accessMode,
  setAccessMode,
  price,
  setPrice,
  templateKey,
  setTemplateKey,
  coverPreviewUrl,
  onCoverFileChange,
  isEditing,
  hasExistingCover,
  removeCoverImage,
  onRemoveCover,
  allowLearnerUploads,
  setAllowLearnerUploads,
  learnerUploadNote,
  setLearnerUploadNote,
  sellerBillingReady,
  connectedAccountStatus,
}: {
  titleText: string;
  submitText: string;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  formError: string;
  saving: boolean;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  level: (typeof LEVELS)[number]['value'];
  setLevel: (v: (typeof LEVELS)[number]['value']) => void;
  accessMode: CourseAccessMode;
  setAccessMode: (v: CourseAccessMode) => void;
  price: string;
  setPrice: (v: string) => void;
  templateKey: CourseTemplateKey;
  setTemplateKey: (v: CourseTemplateKey) => void;
  coverPreviewUrl: string;
  onCoverFileChange: (file: File | null) => void;
  isEditing: boolean;
  hasExistingCover: boolean;
  removeCoverImage: boolean;
  onRemoveCover: () => void;
  allowLearnerUploads: boolean;
  setAllowLearnerUploads: (v: boolean) => void;
  learnerUploadNote: string;
  setLearnerUploadNote: (v: string) => void;
  sellerBillingReady: boolean;
  connectedAccountStatus: 'not_connected' | 'pending' | 'ready';
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h3 className="text-lg font-semibold">{titleText}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        <form className="space-y-4 overflow-y-auto p-5" onSubmit={e => void onSubmit(e)}>
          <div className="grid gap-3">
            <CourseCoverArt
              title={title || 'Course cover preview'}
              category={category}
              thumbnailUrl={coverPreviewUrl}
              templateKey={templateKey}
              className="h-48 w-full rounded-[24px]"
            />
            <div className="rounded-[24px] border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                <Sparkles className="size-4" />
                Template preview
              </div>
              <p className="mt-1 text-sm text-neutral-500">Pick visually first, then fine-tune the cover with your own uploaded image if needed.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {COURSE_TEMPLATES.map(template => {
                  const active = templateKey === template.key;
                  return (
                    <button
                      key={template.key}
                      type="button"
                      onClick={() => setTemplateKey(template.key)}
                      className={[
                        'rounded-[22px] border p-2 text-left transition',
                        active ? 'border-black bg-white shadow-sm' : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50',
                      ].join(' ')}
                    >
                      <CourseCoverArt
                        title={title || `${template.label} template`}
                        category={category || template.label}
                        templateKey={template.key}
                        className="h-24 w-full rounded-[18px]"
                      />
                      <div className="px-1 pb-1 pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-neutral-900">{template.label}</span>
                          {active ? <span className="rounded-full bg-black px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white">Active</span> : null}
                        </div>
                        <p className="mt-1 text-sm leading-5 text-neutral-500">{template.hint}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="grid gap-1">
              <span className="text-sm text-neutral-600">Cover image</span>
              <input
                type="file"
                accept="image/*"
                onChange={e => onCoverFileChange(e.target.files?.[0] ?? null)}
                className="rounded-lg border px-3 py-2"
              />
              <span className="text-xs leading-5 text-neutral-500">Supported formats: JPG, PNG, WEBP, GIF. Maximum file size: 8 MB.</span>
            </label>
            {isEditing && hasExistingCover && (
              <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
                <span>Current uploaded cover is active for this course card.</span>
                <button
                  type="button"
                  onClick={onRemoveCover}
                  className="rounded-full border border-neutral-300 px-3 py-1 text-neutral-700 transition hover:bg-white"
                >
                  Remove cover
                </button>
              </div>
            )}
            {isEditing && removeCoverImage && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Uploaded cover will be removed on save and the selected template will take over.
              </div>
            )}
          </div>

          <label className="grid gap-1">
            <span className="text-sm text-neutral-600">Course title</span>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="rounded-lg border px-3 py-2"
              placeholder="e.g. History of Ancient Rome"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-neutral-600">Description</span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="min-h-[90px] rounded-lg border px-3 py-2"
              placeholder="Short course description"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-neutral-600">Category</span>
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="rounded-lg border px-3 py-2"
                placeholder="History"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm text-neutral-600">Level</span>
              <select
                value={level}
                onChange={e => setLevel(e.target.value as (typeof LEVELS)[number]['value'])}
                className="rounded-lg border px-3 py-2"
              >
                {LEVELS.map(item => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-[24px] border border-neutral-200 bg-[linear-gradient(160deg,_rgba(255,255,255,0.98),_rgba(244,241,233,0.72))] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-neutral-900">Learner upload area</div>
                <p className="mt-1 text-sm leading-6 text-neutral-500">Let enrolled students with InteLections+ drop their own supporting files into this course. This keeps the classroom flow ready for later storage tiers without changing the experience again.</p>
              </div>
              <label className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={allowLearnerUploads}
                  onChange={e => setAllowLearnerUploads(e.target.checked)}
                />
                Enable uploads
              </label>
            </div>
            <label className="mt-4 grid gap-1">
              <span className="text-sm text-neutral-600">Student note</span>
              <textarea
                value={learnerUploadNote}
                onChange={e => setLearnerUploadNote(e.target.value)}
                className="min-h-[88px] rounded-lg border bg-white px-3 py-2"
                placeholder="Optional guidance, for example: upload your handwritten notes, worksheet drafts, or project files for this course."
              />
            </label>
          </div>

          <div className="grid gap-3">
            <div>
              <span className="text-sm text-neutral-600">Access model</span>
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setAccessMode('public-free')}
                  className={[
                    'rounded-[22px] border p-4 text-left transition',
                    accessMode === 'public-free' ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-base font-semibold text-neutral-900">Public free</span>
                    {accessMode === 'public-free' ? <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white">Active</span> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">Visible in Discover and open for free public enrollment.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAccessMode('public-paid')}
                  disabled={!sellerBillingReady}
                  className={[
                    'rounded-[22px] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60',
                    accessMode === 'public-paid' ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-base font-semibold text-neutral-900">Public paid</span>
                    {accessMode === 'public-paid' ? <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white">Active</span> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">Visible in Discover with Stripe checkout for learners who want to buy access.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAccessMode('class-only')}
                  className={[
                    'rounded-[22px] border p-4 text-left transition',
                    accessMode === 'class-only' ? 'border-sky-300 bg-sky-50' : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-base font-semibold text-neutral-900">Class-only</span>
                    {accessMode === 'class-only' ? <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-white">Active</span> : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">Hidden from Discover and available only through assigned classes.</p>
                </button>
              </div>
            </div>

            {!sellerBillingReady ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                {connectedAccountStatus === 'pending'
                  ? 'Finish Stripe onboarding in Account before publishing paid courses. Once payouts are ready, Checkout can route course revenue to your Stripe account with a 1% InteLections fee.'
                  : 'Connect Stripe payouts in Account before creating or publishing paid courses. Paid course sales route revenue to your Stripe account through Stripe Connect.'}
              </div>
            ) : null}

            <label className="grid gap-1 md:max-w-xs">
              <span className="text-sm text-neutral-600">Price (PLN)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={accessMode !== 'public-paid'}
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="rounded-lg border px-3 py-2 disabled:bg-neutral-100"
                placeholder="29.99"
              />
              <span className="text-xs leading-5 text-neutral-500">{accessMode === 'public-paid' ? 'This amount is used in Stripe Checkout when learners buy access to this course.' : accessMode === 'class-only' ? 'Class-only courses skip public checkout and stay available through assigned classes.' : 'Switch to Public paid to set a price for this course.'}</span>
            </label>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-3 py-2 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-3 py-2 text-white disabled:opacity-60"
            >
              {submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CourseStatsModal({
  loading,
  error,
  stats,
  onClose,
}: {
  loading: boolean;
  error: string;
  stats: TeacherCourseStats | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5">
          <div>
            <h3 className="text-xl font-semibold">Global course statistics</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">A cross-course view of participation, activity, and quiz performance for this authored course.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">
            Close
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-8 text-sm text-neutral-600">Loading statistics...</div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
        ) : stats ? (
          <>
            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <MiniMetric label="Assigned groups" value={String(stats.course.assignedGroupsCount)} />
              <MiniMetric label="Participants" value={String(stats.course.participantCount)} />
              <MiniMetric label="Attempts" value={String(stats.course.attemptsCount)} />
              <MiniMetric label="Avg. score" value={stats.course.avgQuizScore == null ? 'No data' : `${stats.course.avgQuizScore}%`} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <MiniMetric label="Sales" value={String(stats.course.salesCount)} />
              <MiniMetric label="Summary" value={formatMoney(stats.course.grossRevenueCents)} />
              <MiniMetric label="InteLections fee" value={formatMoney(stats.course.platformFeeCents)} />
              <MiniMetric label="Expected payout" value={formatMoney(stats.course.netPayoutCents)} />
            </div>

            <div className="mt-5 rounded-[24px] border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{stats.course.category}</p>
              <h4 className="mt-2 text-lg font-semibold text-neutral-900">{stats.course.title}</h4>
              <p className="mt-1 text-sm text-neutral-600">{formatLevel(stats.course.level)}</p>
            </div>

            <div className="mt-5 rounded-[24px] border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-neutral-900">Sales history</h4>
                  <p className="mt-1 text-sm leading-6 text-neutral-500">Confirmed paid purchases routed through Stripe Checkout and Stripe Connect.</p>
                </div>
                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-neutral-600">
                  {stats.course.lastSaleAt ? `Last sale ${formatDateLabel(stats.course.lastSaleAt)}` : 'No sales yet'}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {stats.sales.map(sale => (
                  <article key={sale.id} className="rounded-[22px] border border-neutral-200 bg-neutral-50 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-neutral-900">{sale.buyerName}</div>
                        <div className="mt-1 text-sm text-neutral-500">{sale.buyerEmail}</div>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">
                        Paid
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <MiniMetric label="Gross" value={formatMoney(sale.amountCents, sale.currency)} />
                      <MiniMetric label="InteLections fee" value={formatMoney(sale.platformFeeCents, sale.currency)} />
                      <MiniMetric label="Expected payout" value={formatMoney(sale.netPayoutCents, sale.currency)} />
                    </div>
                    <div className="mt-3 text-xs leading-5 text-neutral-500">
                      Paid on {sale.paidAt ? formatDateLabel(sale.paidAt) : 'Unknown'}
                    </div>
                  </article>
                ))}
                {stats.sales.length === 0 ? <EmptyCard text="No paid purchases have been confirmed for this course yet." compact /> : null}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {stats.participants.map(participant => (
                <article key={participant.id} className="rounded-[24px] border border-neutral-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      {participant.profileBlocked ? (
                        <span className="font-medium text-neutral-900">{participant.name}</span>
                      ) : (
                        <Link to={`/profile/${participant.id}`} className="font-medium text-neutral-900 underline-offset-4 hover:underline">
                          {participant.name}
                        </Link>
                      )}
                      <p className="mt-1 text-sm text-neutral-500">{participant.groupNames.join(', ') || 'No classes linked'}</p>
                    </div>
                    <EnrollmentPill enrolled={participant.isEnrolled} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <MiniMetric label="Avg. score" value={participant.avgQuizScore == null ? 'No attempts' : `${participant.avgQuizScore}%`} />
                    <MiniMetric label="Attempts" value={String(participant.attemptsCount)} />
                    <MiniMetric label="Passed quizzes" value={String(participant.passedQuizzesCount)} />
                    <MiniMetric label="Last activity" value={participant.lastActivity ? formatDateLabel(participant.lastActivity) : 'Waiting'} />
                  </div>
                </article>
              ))}
                {stats.participants.length === 0 ? <EmptyCard text="No participants have reached this course through your classes yet." compact /> : null}
              </div>
          </>
        ) : null}
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-neutral-800">{value}</p>
    </div>
  );
}

function EnrollmentPill({ enrolled }: { enrolled: boolean }) {
  return (
    <span className={[
      'rounded-full px-3 py-1 text-sm font-medium',
      enrolled ? 'bg-sky-100 text-sky-800' : 'bg-neutral-200 text-neutral-700',
    ].join(' ')}>
      {enrolled ? 'Enrolled' : 'Not joined'}
    </span>
  );
}

function EmptyCard({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={[
      'grid place-items-center rounded-[24px] border border-dashed border-neutral-300 bg-neutral-50 text-center text-neutral-500',
      compact ? 'px-4 py-10' : 'px-5 py-16',
    ].join(' ')}>
      <p className="max-w-md text-sm leading-6">{text}</p>
    </div>
  );
}

function formatLevel(value: string) {
  if (!value) return 'Level not set';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDateLabel(value: string) {
  if (!value) return 'Waiting';
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatMoney(amountCents: number, currency = 'PLN') {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(amountCents || 0)) / 100);
}







