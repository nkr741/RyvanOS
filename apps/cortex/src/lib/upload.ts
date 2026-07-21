interface UploadResult {
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
}

export async function uploadFile(
  file: File | Blob,
  category: string,
  token: string,
  fileName?: string
): Promise<UploadResult> {
  const formData = new FormData();

  if (file instanceof File) {
    formData.append("file", file);
  } else {
    formData.append("file", file, fileName || "recording.webm");
  }

  formData.append("category", category);

  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || "Upload failed");
  }

  return res.json();
}

export async function uploadSurveyFiles(
  documents: Record<string, File | null>,
  voiceBlob: Blob | null,
  surveyType: "vendor" | "rider",
  token: string
): Promise<{ docUrls: Record<string, string>; voiceUrl: string | null }> {
  const docUrls: Record<string, string> = {};
  let voiceUrl: string | null = null;

  const uploads: Promise<void>[] = [];

  for (const [key, file] of Object.entries(documents)) {
    if (!file) continue;
    uploads.push(
      uploadFile(file, `${surveyType}-docs`, token).then((result) => {
        docUrls[key] = result.filePath;
      })
    );
  }

  if (voiceBlob) {
    uploads.push(
      uploadFile(voiceBlob, `${surveyType}-voice`, token, "voice-note.webm").then(
        (result) => {
          voiceUrl = result.filePath;
        }
      )
    );
  }

  await Promise.all(uploads);

  return { docUrls, voiceUrl };
}
