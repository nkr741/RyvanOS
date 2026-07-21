import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/webm",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
];

export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `File type "${file.type}" is not allowed. Accepted types: JPEG, PNG, WebP, HEIC, PDF, DOC, DOCX, WebM, WAV, MP3, MP4, OGG`,
        },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${timestamp}_${sanitizedName}`;

    // Determine subdirectory based on optional category
    const category = formData.get("category") as string | null;
    const subDir = (category || "general").replace(/[^a-zA-Z0-9_-]/g, "_");

    const baseUploadDir = path.resolve(process.cwd(), "public", "uploads");
    const uploadDir = path.resolve(baseUploadDir, subDir);

    if (!uploadDir.startsWith(baseUploadDir)) {
      return NextResponse.json(
        { error: "Invalid upload category" },
        { status: 400 }
      );
    }

    // Ensure directory exists
    await mkdir(uploadDir, { recursive: true });

    // Write file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filePath = path.resolve(uploadDir, fileName);

    if (!filePath.startsWith(uploadDir)) {
      return NextResponse.json(
        { error: "Invalid file name" },
        { status: 400 }
      );
    }

    await writeFile(filePath, buffer);

    // Return public path
    const publicPath = `/uploads/${subDir}/${fileName}`;

    return NextResponse.json(
      {
        fileName: file.name,
        filePath: publicPath,
        fileSize: file.size,
        fileType: file.type,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
