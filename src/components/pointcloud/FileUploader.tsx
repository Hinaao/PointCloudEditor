'use client';

import React from 'react';
import { useDropzone } from 'react-dropzone';
import { FolderOpen } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface FileUploaderProps {
  onFilesUpload: (files: File[]) => void;
  isLoading: boolean;
  acceptedFileTypes?: Record<string, string[]>;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  onFilesUpload,
  isLoading,
  acceptedFileTypes = {
    'text/csv': ['.csv'],
    'application/octet-stream': ['.pcd'],
  }
}) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: acceptedFileTypes,
    onDrop: onFilesUpload
  });

  return (
    <div {...getRootProps()} className="cursor-pointer">
      <input {...getInputProps()} />
      <Card className={`p-6 border-2 border-dashed ${isDragActive ? 'border-primary bg-primary/5' : 'border-border'}`}>
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <FolderOpen className="w-10 h-10 text-muted-foreground" />
          {isLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : isDragActive ? (
            <p className="text-sm">ファイルをドロップしてください</p>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium">クリックしてファイルを選択するか、ドラッグ＆ドロップしてください</p>
                <p className="text-xs text-muted-foreground mt-1">対応形式: CSV, PCD</p>
              </div>
              <Button size="sm" variant="outline">
                ファイルを選択
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
};
