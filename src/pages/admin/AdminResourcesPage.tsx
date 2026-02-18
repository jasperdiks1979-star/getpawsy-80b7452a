import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Upload, FileText, Download, Copy, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

export default function AdminResourcesPage() {
  const { isAdmin, isLoading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState('');

  const { data: resources, isLoading } = useQuery({
    queryKey: ['admin-resources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_resources')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
  });

  const deleteMutation = useMutation({
    mutationFn: async (resource: { id: string; file_path: string }) => {
      // Delete from storage
      await supabase.storage.from('admin-resources').remove([resource.file_path]);
      // Delete from table
      const { error } = await supabase.from('admin_resources').delete().eq('id', resource.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-resources'] });
      toast.success('Resource deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!title.trim()) {
      toast.error('Please enter a title first');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      const { error: uploadError } = await supabase.storage
        .from('admin-resources')
        .upload(path, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('admin-resources')
        .getPublicUrl(path);

      const { error: dbError } = await supabase.from('admin_resources').insert({
        title: title.trim(),
        file_path: path,
        file_url: urlData.publicUrl,
        file_size: file.size,
        uploaded_by: user?.id,
      });

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ['admin-resources'] });
      setTitle('');
      toast.success('Resource uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied');
  };

  const downloadFile = async (path: string, title: string) => {
    const { data, error } = await supabase.storage
      .from('admin-resources')
      .download(path);
    if (error) { toast.error('Download failed'); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = title;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!authLoading && !isAdmin) {
    navigate('/dashboard');
    return null;
  }

  return (
    <Layout>
      <Helmet><title>Resources | Admin</title></Helmet>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Admin Resources
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload PDFs, documents, and internal files. Admin-only access.
          </p>
        </div>

        {/* Upload */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Upload New Resource</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  placeholder="Resource title..."
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="mb-2"
                />
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.xlsx,.csv,.txt,.png,.jpg"
                  onChange={handleUpload}
                  disabled={uploading || !title.trim()}
                />
              </div>
              {uploading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
          </CardContent>
        </Card>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : resources && resources.length > 0 ? (
          <div className="space-y-2">
            {resources.map(r => (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), 'MMM d, yyyy')} · {formatFileSize(r.file_size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => downloadFile(r.file_path, r.title)}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => copyUrl(r.file_url)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate({ id: r.id, file_path: r.file_path })}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground text-sm">
              No resources uploaded yet. Add your first file above.
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
