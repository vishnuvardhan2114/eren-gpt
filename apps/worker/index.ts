import cors from "cors";
import express from "express";
import { prismaClient } from "db/client";
import OpenAI from "openai";
import { systemPrompt } from "./systemPrompt";
import { ArtifactProcessor } from "./parser";
import { onFileUpdate, onShellCommand } from "./os";

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure this is set in your environment
});

app.post("/prompt", async (req, res) => {
  try {
    const { prompt, projectId } = req.body;

    // Store the user prompt in the database
    await prismaClient.prompt.create({
      data: {
        content: prompt,
        projectId,
        type: "USER",
      },
    });

    // Retrieve all prompts for this project
    const allPrompts = await prismaClient.prompt.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    // Convert prompt history to OpenAI's expected format
    const messages = allPrompts.map((p: any) => ({
      role: p.type === "USER" ? "user" : "assistant",
      content: p.content,
    }));

    let artifactProcessor = new ArtifactProcessor(
      "",
      (filePath, fileContent) => onFileUpdate(filePath, fileContent, projectId),
      (shellCommand) => onShellCommand(shellCommand, projectId)
    );

    let artifact = "";

    // Stream OpenAI response
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      // @ts-ignore
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: 8000,
      stream: true,
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      artifactProcessor.append(text);
      artifactProcessor.parse();
      artifact += text;

      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }

    // Save AI response in the database
    await prismaClient.prompt.create({
      data: {
        content: artifact,
        projectId,
        type: "SYSTEM",
      },
    });

    await prismaClient.action.create({
      data: {
        content: "Done!",
        projectId,
      },
    });

    res.write("event: done\ndata: {}\n\n");
    res.end();
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(9091, () => {
  console.log("Server is running on port 9091");
});
