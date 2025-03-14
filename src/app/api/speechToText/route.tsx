import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

const openai = new OpenAI();

export async function POST(request: Request) {
  const blob = await request.blob();

  const tempDir = path.join(process.cwd(), 'tmp'); // Using process.cwd() for safety
  const filePath = path.join(tempDir, 'audio.mp3');

  // Ensure the directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  fs.writeFileSync(filePath, uint8Array); // Now it's happy with the type

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-1',
  });

  const answer = transcription.text;

  return NextResponse.json({ answer });
}
