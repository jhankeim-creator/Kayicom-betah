import { useEffect, useState, useCallback } from 'react';
import { axiosInstance } from '../App';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Plus, Upload, Key, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const ProductCodesManager = ({ product, open, onOpenChange }) => {
  const [codes, setCodes] = useState([]);
  const [stats, setStats] = useState({ total: 0, available: 0, delivered: 0, reserved: 0 });
  const [loading, setLoading] = useState(false);
  const [singleCode, setSingleCode] = useState('');
  const [bulkCodes, setBulkCodes] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [filter, setFilter] = useState('all');

  const loadCodes = useCallback(async () => {
    if (!product?.id) return;
    setLoading(true);
    try {
      const statusParam = filter !== 'all' ? `?status=${filter}` : '';
      const [codesRes, statsRes] = await Promise.all([
        axiosInstance.get(`/products/${product.id}/codes${statusParam}`),
        axiosInstance.get(`/products/${product.id}/codes/stats`),
      ]);
      setCodes(codesRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Error loading codes:', err);
      toast.error('Error loading codes');
    } finally {
      setLoading(false);
    }
  }, [product?.id, filter]);

  useEffect(() => {
    if (open && product?.id) {
      loadCodes();
    }
  }, [open, product?.id, loadCodes]);

  const handleAddSingle = async () => {
    const trimmed = singleCode.trim();
    if (!trimmed) {
      toast.error('Enter a code');
      return;
    }
    try {
      await axiosInstance.post(`/products/${product.id}/codes`, { code: trimmed });
      toast.success('Code added');
      setSingleCode('');
      loadCodes();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Error adding code';
      if (err.response?.status === 409) {
        toast.error(`Duplicate: "${trimmed}" already exists`);
      } else {
        toast.error(detail);
      }
    }
  };

  const handleBulkAdd = async () => {
    const lines = bulkCodes.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      toast.error('Enter at least one code');
      return;
    }
    try {
      const res = await axiosInstance.post(`/products/${product.id}/codes/bulk`, { codes: lines });
      const { added, skipped_duplicates } = res.data;
      if (added > 0) {
        toast.success(`${added} code(s) added`);
      }
      if (skipped_duplicates > 0) {
        toast.warning(`${skipped_duplicates} duplicate(s) skipped`);
      }
      setBulkCodes('');
      setShowBulk(false);
      loadCodes();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error adding codes');
    }
  };

  const handleDelete = async (codeId) => {
    if (!window.confirm('Delete this code?')) return;
    try {
      await axiosInstance.delete(`/products/${product.id}/codes/${codeId}`);
      toast.success('Code deleted');
      loadCodes();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error deleting code');
    }
  };

  const statusBadge = (status) => {
    switch (status) {
      case 'available':
        return <Badge className="bg-green-500/20 text-green-300 border-green-500/30">Available</Badge>;
      case 'delivered':
        return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">Delivered</Badge>;
      case 'reserved':
        return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">Reserved</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-gray-900 border-white/20 w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-white text-lg flex items-center gap-2">
            <Key size={20} className="text-green-400" />
            Manage Codes — {product?.name}
          </DialogTitle>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-white/60 text-xs">Total</p>
            <p className="text-white font-bold text-lg">{stats.total}</p>
          </div>
          <div className="bg-green-500/10 rounded-lg p-3 text-center">
            <p className="text-green-300/80 text-xs">Available</p>
            <p className="text-green-300 font-bold text-lg">{stats.available}</p>
          </div>
          <div className="bg-blue-500/10 rounded-lg p-3 text-center">
            <p className="text-blue-300/80 text-xs">Delivered</p>
            <p className="text-blue-300 font-bold text-lg">{stats.delivered}</p>
          </div>
          <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
            <p className="text-yellow-300/80 text-xs">Reserved</p>
            <p className="text-yellow-300 font-bold text-lg">{stats.reserved}</p>
          </div>
        </div>

        {/* Add single code */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={singleCode}
              onChange={(e) => setSingleCode(e.target.value)}
              placeholder="Enter code or credential..."
              className="bg-white/10 border-white/20 text-white flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSingle(); }}
            />
            <Button
              onClick={handleAddSingle}
              className="bg-green-600 hover:bg-green-700 text-white"
              size="sm"
            >
              <Plus size={16} className="mr-1" /> Add
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulk(!showBulk)}
              className="border-cyan-400 text-green-300 hover:bg-cyan-400/10 text-xs"
            >
              <Upload size={14} className="mr-1" /> {showBulk ? 'Hide' : 'Bulk Add'}
            </Button>
          </div>

          {/* Bulk add */}
          {showBulk && (
            <div className="p-3 bg-cyan-500/10 border border-green-500/30 rounded-lg space-y-2">
              <Label className="text-white text-sm">Paste codes (one per line)</Label>
              <div className="flex items-center gap-2 text-xs text-yellow-300">
                <AlertCircle size={14} />
                <span>Duplicates will be automatically skipped</span>
              </div>
              <Textarea
                value={bulkCodes}
                onChange={(e) => setBulkCodes(e.target.value)}
                placeholder={"CODE-001\nCODE-002\nCODE-003"}
                className="bg-white/10 border-white/20 text-white font-mono text-sm"
                rows={6}
              />
              <Button
                onClick={handleBulkAdd}
                className="bg-cyan-600 hover:bg-cyan-700 text-white w-full"
                size="sm"
              >
                Add {bulkCodes.split('\n').filter(l => l.trim()).length} Codes
              </Button>
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mt-4 mb-2">
          {['all', 'available', 'delivered', 'reserved'].map((f) => (
            <Button
              key={f}
              size="sm"
              onClick={() => setFilter(f)}
              className={`text-xs ${filter === f ? 'bg-green-500 text-white' : 'bg-white/10 text-white/70'}`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>

        {/* Code list */}
        <ScrollArea className="h-[300px] rounded-lg border border-white/10">
          {loading ? (
            <div className="text-center text-white/60 py-8">Loading...</div>
          ) : codes.length === 0 ? (
            <div className="text-center text-white/40 py-8">
              No codes yet. Add codes above for automatic delivery.
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {codes.map((code) => (
                <div
                  key={code.id}
                  className="flex items-center justify-between gap-2 p-2 bg-white/5 rounded-lg border border-white/10 hover:border-white/20"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-mono truncate">{code.code}</p>
                    {code.order_id && (
                      <p className="text-white/40 text-xs truncate">Order: {code.order_id}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {statusBadge(code.status)}
                    {code.status !== 'delivered' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(code.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-7 w-7 p-0"
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default ProductCodesManager;
