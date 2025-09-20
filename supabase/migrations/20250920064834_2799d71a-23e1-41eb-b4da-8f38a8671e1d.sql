-- Create enum for AI providers
CREATE TYPE public.ai_provider AS ENUM ('openai', 'anthropic', 'google');

-- Create enum for annotation status
CREATE TYPE public.annotation_status AS ENUM ('pending', 'ai_generated', 'human_reviewed', 'approved', 'rejected');

-- Create table for uploaded files
CREATE TABLE public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create table for annotation projects
CREATE TABLE public.annotation_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_id UUID REFERENCES public.uploaded_files(id) ON DELETE CASCADE NOT NULL,
  project_name TEXT NOT NULL,
  ai_provider ai_provider NOT NULL,
  ai_model TEXT NOT NULL,
  prompt_template TEXT,
  total_items INTEGER DEFAULT 0,
  completed_items INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create table for annotations
CREATE TABLE public.annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.annotation_projects(id) ON DELETE CASCADE NOT NULL,
  item_index INTEGER NOT NULL,
  original_text TEXT NOT NULL,
  ai_annotation TEXT,
  human_annotation TEXT,
  final_annotation TEXT,
  status annotation_status DEFAULT 'pending' NOT NULL,
  confidence_score DECIMAL(3,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(project_id, item_index)
);

-- Enable RLS on all tables
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annotation_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for uploaded_files
CREATE POLICY "Users can view their own files" ON public.uploaded_files
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upload their own files" ON public.uploaded_files
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own files" ON public.uploaded_files
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own files" ON public.uploaded_files
  FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for annotation_projects
CREATE POLICY "Users can view their own projects" ON public.annotation_projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own projects" ON public.annotation_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" ON public.annotation_projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" ON public.annotation_projects
  FOR DELETE USING (auth.uid() = user_id);

-- Create RLS policies for annotations
CREATE POLICY "Users can view annotations from their projects" ON public.annotations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.annotation_projects 
      WHERE id = annotations.project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create annotations for their projects" ON public.annotations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.annotation_projects 
      WHERE id = annotations.project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update annotations from their projects" ON public.annotations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.annotation_projects 
      WHERE id = annotations.project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete annotations from their projects" ON public.annotations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.annotation_projects 
      WHERE id = annotations.project_id AND user_id = auth.uid()
    )
  );

-- Create storage bucket for uploaded files
INSERT INTO storage.buckets (id, name, public) VALUES ('annotation-files', 'annotation-files', false);

-- Create storage policies
CREATE POLICY "Users can upload their own files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'annotation-files' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'annotation-files' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own files" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'annotation-files' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'annotation-files' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_uploaded_files_updated_at
  BEFORE UPDATE ON public.uploaded_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_annotation_projects_updated_at
  BEFORE UPDATE ON public.annotation_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at
  BEFORE UPDATE ON public.annotations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();