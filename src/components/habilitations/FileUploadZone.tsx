import { useCallback, useState, useEffect, useRef } from 'react';
import { Upload, FileSpreadsheet, X, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';

interface FileUploadZoneProps {
  onFileSelected: (file: File) => void;
  isImporting: boolean;
  onImportComplete?: () => void;
}

export function FileUploadZone({ onFileSelected, isImporting, onImportComplete }: FileUploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wasImporting = useRef(false);

  useEffect(() => {
    if (wasImporting.current && !isImporting) {
      setSelectedFile(null);
      setError(null);
      if (onImportComplete) {
        onImportComplete();
      }
    }
    wasImporting.current = isImporting;
  }, [isImporting, onImportComplete]);

  const validateFile = useCallback((file: File): boolean => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ];
    const name = file.name.toLowerCase();
    const isValidType = validTypes.includes(file.type) || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');

    if (!isValidType) {
      setError('Format non supporté. Veuillez importer un fichier CSV ou Excel (.csv, .xlsx).');
      return false;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Le fichier est trop volumineux (max 10 Mo).');
      return false;
    }

    setError(null);
    return true;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
  }, [validateFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setSelectedFile(file);
    }
    e.target.value = '';
  }, [validateFile]);

  const handleImport = () => {
    if (selectedFile) {
      onFileSelected(selectedFile);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setError(null);
  };

  return (
    <div className="space-y-3">
      {!selectedFile ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 cursor-pointer
            ${dragOver
              ? 'border-teal-400 bg-teal-50 scale-[1.01]'
              : 'border-gray-300 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-50'
            }
          `}
          onClick={() => document.getElementById('habilitation-file-input')?.click()}
        >
          <input
            id="habilitation-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileInput}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-3">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${
              dragOver ? 'bg-teal-100' : 'bg-gray-100'
            }`}>
              <Upload className={`w-7 h-7 ${dragOver ? 'text-teal-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                Glissez-déposez votre fichier ici
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ou cliquez pour parcourir — Format CSV ou Excel
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 p-4 bg-teal-50 border border-teal-200 rounded-xl">
          <div className="w-12 h-12 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
            <FileSpreadsheet className="w-6 h-6 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{selectedFile.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {(selectedFile.size / 1024).toFixed(1)} Ko
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              onClick={handleImport}
              disabled={isImporting}
              size="sm"
            >
              {isImporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Import en cours...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Importer
                </>
              )}
            </Button>
            {!isImporting && (
              <button
                onClick={handleClear}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
