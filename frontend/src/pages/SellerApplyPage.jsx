import { useState } from 'react';
import { axiosInstance } from '../App';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Store, Upload, FileCheck, Clock, CheckCircle, XCircle, User, MapPin, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';

const SellerApplyPage = ({ user, logout, settings }) => {
  const [storeName, setStoreName] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [sellingPlatforms, setSellingPlatforms] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [sellingProofUrl, setSellingProofUrl] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState(() => {
    if (!user) return 'login';
    const s = user.seller_status;
    if (s === 'approved') return 'approved';
    if (s === 'kyc_submitted') return 'pending_review';
    if (s === 'rejected') return 'kyc';
    if (s === 'pending_kyc') return 'kyc';
    return 'apply';
  });

  const uploadImage = async (file) => {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Max 5MB');
      return null;
    }
    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await axiosInstance.post('/upload/image', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data?.url || null;
    } catch {
      toast.error('Upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleApply = async () => {
    if (!storeName.trim()) { toast.error('Enter your store name'); return; }
    if (!phone.trim()) { toast.error('Enter your phone number'); return; }
    if (!country.trim()) { toast.error('Select your country'); return; }
    if (!city.trim()) { toast.error('Enter your city'); return; }
    if (!address.trim()) { toast.error('Enter your address'); return; }
    if (!dateOfBirth) { toast.error('Enter your date of birth'); return; }
    try {
      await axiosInstance.post(`/seller/apply?user_id=${user.id}`, {
        store_name: storeName.trim(),
        bio: bio.trim() || null,
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        country: country.trim(),
        date_of_birth: dateOfBirth,
        selling_platforms: sellingPlatforms.trim() || null,
        years_experience: yearsExperience ? parseInt(yearsExperience, 10) : null,
        selling_proof_url: sellingProofUrl || null,
      });
      toast.success('Application submitted! Now upload your KYC documents.');
      setStep('kyc');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error applying');
    }
  };

  const handleKYCSubmit = async () => {
    if (!docUrl || !selfieUrl) { toast.error('Upload both documents'); return; }
    try {
      await axiosInstance.post(`/seller/kyc?user_id=${user.id}`, {
        document_url: docUrl,
        selfie_url: selfieUrl,
      });
      toast.success('KYC submitted! We will review your application.');
      setStep('pending_review');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error submitting KYC');
    }
  };

  const statusInfo = {
    approved: { icon: <CheckCircle className="text-green-400" size={48} />, color: 'green', label: 'Approved' },
    pending_review: { icon: <Clock className="text-yellow-400" size={48} />, color: 'yellow', label: 'Under Review' },
    rejected: { icon: <XCircle className="text-red-400" size={48} />, color: 'red', label: 'Rejected' },
  };

  const countries = [
    'Haiti', 'United States', 'Canada', 'France', 'Dominican Republic',
    'Jamaica', 'Bahamas', 'Trinidad and Tobago', 'Barbados', 'Guadeloupe',
    'Martinique', 'Saint Lucia', 'Grenada', 'Antigua and Barbuda', 'Dominica',
    'Saint Vincent', 'Belize', 'Suriname', 'Guyana', 'Other'
  ];

  return (
    <div className="min-h-screen gradient-bg">
      <Navbar user={user} logout={logout} cartItemCount={0} settings={settings} />
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Store className="text-green-400" /> Become a Seller
        </h1>
        <p className="text-white/60 mb-8">Sell your digital products on KayiCom</p>

        {step === 'apply' && (
          <Card className="glass-effect border-white/20">
            <CardContent className="p-6 space-y-6">
              {/* Section 1: Personal Information */}
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                  <User className="text-green-400" size={20} /> Personal Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label className="text-white">Full Name</Label>
                    <Input value={user?.full_name || ''} disabled
                      className="bg-white/5 border-white/10 text-white/60 mt-1" />
                    <p className="text-white/30 text-xs mt-1">From your account</p>
                  </div>
                  <div>
                    <Label className="text-white">Phone Number *</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1" placeholder="+509 XXXX XXXX" />
                  </div>
                  <div>
                    <Label className="text-white">Date of Birth *</Label>
                    <Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1" />
                  </div>
                  <div>
                    <Label className="text-white">Country *</Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger className="bg-white/10 border-white/20 text-white mt-1">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {countries.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white">City *</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1" placeholder="Port-au-Prince" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-white">Address *</Label>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1" placeholder="Your full address" />
                  </div>
                </div>
              </div>

              {/* Section 2: Store Information */}
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                  <Store className="text-green-400" size={20} /> Store Information
                </h2>
                <div className="space-y-4">
                  <div>
                    <Label className="text-white">Store Name *</Label>
                    <Input value={storeName} onChange={(e) => setStoreName(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1" placeholder="Your store name" />
                  </div>
                  <div>
                    <Label className="text-white">Bio / Description</Label>
                    <Textarea value={bio} onChange={(e) => setBio(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1" rows={3}
                      placeholder="Tell us about your business..." />
                  </div>
                </div>
              </div>

              {/* Section 3: Selling Experience */}
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                  <ShoppingBag className="text-green-400" size={20} /> Selling Experience
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label className="text-white">Platforms where you already sell</Label>
                    <Input value={sellingPlatforms} onChange={(e) => setSellingPlatforms(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1"
                      placeholder="eBay, Amazon, Facebook Marketplace, Instagram..." />
                    <p className="text-white/30 text-xs mt-1">Separate multiple platforms with commas</p>
                  </div>
                  <div>
                    <Label className="text-white">Years of selling experience</Label>
                    <Input type="number" min="0" max="50" value={yearsExperience}
                      onChange={(e) => setYearsExperience(e.target.value)}
                      className="bg-white/10 border-white/20 text-white mt-1" placeholder="0" />
                  </div>
                  <div>
                    <Label className="text-white">Proof of sales (screenshot)</Label>
                    <Input type="file" accept="image/*" disabled={uploading}
                      className="bg-white/10 border-white/20 text-white mt-1 cursor-pointer"
                      onChange={async (e) => {
                        const url = await uploadImage(e.target.files?.[0]);
                        if (url) { setSellingProofUrl(url); toast.success('Proof uploaded'); }
                      }} />
                    {sellingProofUrl && (
                      <div className="mt-2">
                        <Badge className="bg-green-500/20 text-green-300">Proof uploaded</Badge>
                      </div>
                    )}
                    <p className="text-white/30 text-xs mt-1">Screenshot from your other selling platforms</p>
                  </div>
                </div>
              </div>

              <Button onClick={handleApply} className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 text-white">
                Continue to KYC Verification
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'kyc' && (
          <Card className="glass-effect border-white/20">
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xl font-bold text-white">Step 2: KYC Verification</h2>
              <p className="text-white/60 text-sm">Upload a government-issued ID and a selfie holding it.</p>

              {user?.seller_status === 'rejected' && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-300 text-sm">Your previous application was rejected. Please resubmit your documents.</p>
                </div>
              )}

              <div>
                <Label className="text-white">ID Document (Passport, Driver's License, National ID) *</Label>
                <Input type="file" accept="image/*" disabled={uploading}
                  className="bg-white/10 border-white/20 text-white mt-1 cursor-pointer"
                  onChange={async (e) => {
                    const url = await uploadImage(e.target.files?.[0]);
                    if (url) { setDocUrl(url); toast.success('Document uploaded'); }
                  }} />
                {docUrl && <div className="mt-2"><Badge className="bg-green-500/20 text-green-300">Document uploaded</Badge></div>}
              </div>

              <div>
                <Label className="text-white">Selfie with ID *</Label>
                <p className="text-white/40 text-xs mb-1">Take a photo of yourself holding your ID document</p>
                <Input type="file" accept="image/*" disabled={uploading}
                  className="bg-white/10 border-white/20 text-white mt-1 cursor-pointer"
                  onChange={async (e) => {
                    const url = await uploadImage(e.target.files?.[0]);
                    if (url) { setSelfieUrl(url); toast.success('Selfie uploaded'); }
                  }} />
                {selfieUrl && <div className="mt-2"><Badge className="bg-green-500/20 text-green-300">Selfie uploaded</Badge></div>}
              </div>

              {uploading && <p className="text-white/60 text-sm">Uploading...</p>}

              <Button onClick={handleKYCSubmit} disabled={!docUrl || !selfieUrl || uploading}
                className="w-full bg-gradient-to-r from-green-500 to-cyan-500 text-white">
                <FileCheck size={18} className="mr-2" /> Submit KYC for Review
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'pending_review' && (
          <Card className="glass-effect border-yellow-500/20">
            <CardContent className="p-8 text-center space-y-4">
              {statusInfo.pending_review.icon}
              <h2 className="text-2xl font-bold text-white">Application Under Review</h2>
              <p className="text-white/60">Your KYC documents are being reviewed. You will be notified once approved.</p>
              <p className="text-white/40 text-sm">This usually takes 24-48 hours.</p>
            </CardContent>
          </Card>
        )}

        {step === 'approved' && (
          <Card className="glass-effect border-green-500/20">
            <CardContent className="p-8 text-center space-y-4">
              {statusInfo.approved.icon}
              <h2 className="text-2xl font-bold text-white">You're an Approved Seller!</h2>
              <p className="text-white/60">Go to your seller dashboard to manage products and track earnings.</p>
              <Button onClick={() => window.location.href = '/seller'} className="bg-gradient-to-r from-green-500 to-cyan-500 text-white">
                Go to Seller Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      <Footer settings={settings} />
    </div>
  );
};

export default SellerApplyPage;
