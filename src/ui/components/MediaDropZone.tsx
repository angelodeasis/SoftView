import { useId, useState, type DragEvent } from 'react';

interface Props {
  onFile: (file: File) => void;
  accept: string;
}

export function MediaDropZone({ onFile, accept }: Props) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  const takeFirst = (files: FileList | null) => {
    const file = files && files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={dragging ? 'dropzone dropzone--active' : 'dropzone'}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        takeFirst(e.dataTransfer.files);
      }}
    >
      <label className="dropzone__label" htmlFor={inputId}>
        Choose an MP4 or MP3 file
      </label>
      <input id={inputId} type="file" accept={accept} onChange={(e) => takeFirst(e.target.files)} />
      <p className="dropzone__hint">or drag a file here. Your file stays on your device.</p>
    </div>
  );
}
