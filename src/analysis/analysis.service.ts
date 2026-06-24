import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyzeChatDto, AnalysisReport } from './dto/analyze-chat.dto';
import * as fs from 'fs';
import * as path from 'path';
import { ReanalyzeDto } from './dto/reanalyze.dto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AnalysisHistory,
  AnalysisHistoryDocument,
} from './schemas/analysis-history.schema';
import {
  AnalysisSettings,
  AnalysisSettingsDocument,
} from './schemas/analysis-settings.schema';

@Injectable()
export class AnalysisService {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(AnalysisHistory.name)
    private readonly historyModel: Model<AnalysisHistoryDocument>,
    @InjectModel(AnalysisSettings.name)
    private readonly settingsModel: Model<AnalysisSettingsDocument>,
  ) {}

  private fileToGenerativePart(buffer: Buffer, mimeType: string) {
    return {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType,
      },
    };
  }

  private readonly reportStoragePath = path.resolve(process.cwd(), 'uploads', 'reports');

  private async ensureReportStoragePath() {
    await fs.promises.mkdir(this.reportStoragePath, { recursive: true });
  }

  async analyzeChat(
    analyzeChatDto: AnalyzeChatDto,
    images?: any[],
    userId?: string,
  ): Promise<AnalysisReport> {
    const { text } = analyzeChatDto;

    // Validate that at least one of text or an image is provided
    const hasValidImage =
      images && images.length && images.some((img) => img && img.buffer);
    if (!text && !hasValidImage) {
      throw new BadRequestException(
        'Please provide either text or at least one screenshot image of the chat to analyze.',
      );
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Gemini API key is not configured. Please set GEMINI_API_KEY environment variable.',
      );
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `
You are an expert relationship communication analyzer. Your task is to analyze a conversation between two people and generate a comprehensive relationship health report.

The conversation is provided below, either as text or as a screenshot image. Extract and analyze the conversation content.

IMPORTANT: Return ONLY valid JSON - no additional text before or after.

CRITICAL: Extract the actual names of the two participants from the conversation. If names are mentioned, use them directly (e.g., "Muhammad Hamza", "Sarah"). If names are not identifiable, use only "Participant 1" and "Participant 2".

Analyze the conversation using EXACTLY these 6 sections:

1. Relationship Health Score (1-100) - Calculated from 4 components, each scored 0-25:
   - Positive Markers Score (0-25): Presence of respectful wording, support, care, apologies, calm explanations, willingness to understand, effort to solve
   - Negative Markers Score (0-25): REVERSE SCORED - subtract from 25 if present: blaming, insults, pressure, threats, dismissive replies, avoiding issues, disrespect
   - Conflict Insights Score (0-25): How well the conversation addresses core conflicts
   - Roles & Tendencies Score (0-25): Communication pattern consistency and effectiveness
   - TOTAL = Sum of all four (0-100)

2. Roles & Tendencies: Explain how each person communicates in this conversation (factual observations only, no diagnosis)

3. Positive Markers: List positive communication signs with evidence from the conversation

4. Negative Markers: List negative communication signs with evidence from the conversation

5. Conflict Insights: Explain what conflict or communication issue appears in the conversation

6. Improvement Tips: 3-5 simple suggestions to improve communication based on this conversation

JSON Schema (MUST return valid JSON only):
{
  "relationshipHealthScore": {
    "positiveMarkersScore": number,
    "negativeMarkersScore": number,
    "conflictInsightsScore": number,
    "rolesTendenciesScore": number,
    "totalScore": number
  },
  "rolesAndTendencies": [
    {
      "person": "string (actual name extracted from conversation, e.g. 'Muhammad Hamza' or 'Participant 1' if name not identifiable)",
      "role": "string",
      "communicationStyle": "string"
    }
  ],
  "positiveMarkers": [
    {
      "title": "string",
      "description": "string",
      "evidence": "string"
    }
  ],
  "negativeMarkers": [
    {
      "title": "string",
      "description": "string",
      "evidence": "string"
    }
  ],
  "conflictInsights": "string",
  "improvementTips": ["string", "string", "string"]
}

${text ? `Text conversation to analyze:\n"${text}"` : 'Conversation screenshot provided as image below. Please extract and analyze all visible conversation content.'}

Guidelines:
- Use ONLY information from the conversation (text or image)
- Do not diagnose personalities or conditions
- Do not guess beyond what is shown
- Be objective and factual
- Scoring must be between 0-100
- Extract all visible text from the image if analyzing a screenshot
- ALWAYS extract real names from the conversation if mentioned - do NOT use generic labels like "Person A", "Person B", "User 1", "User 2"
- Return valid JSON only
`;

      const parts: any[] = [{ text: prompt }];

      // Add images if provided (up to 4 handled by controller)
      if (images && images.length) {
        for (const img of images) {
          if (img && img.buffer) {
            parts.push(this.fileToGenerativePart(img.buffer, img.mimetype));
          }
        }
      }

      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const responseText = result.response.text();
      const analysis = JSON.parse(responseText);

      // Validate the response structure
      if (!analysis.relationshipHealthScore || !analysis.rolesAndTendencies) {
        throw new InternalServerErrorException(
          'Invalid analysis response structure from Gemini API.',
        );
      }

      // Ensure totalScore is calculated correctly
      if (!analysis.relationshipHealthScore.totalScore) {
        analysis.relationshipHealthScore.totalScore =
          (analysis.relationshipHealthScore.positiveMarkersScore || 0) +
          (analysis.relationshipHealthScore.negativeMarkersScore || 0) +
          (analysis.relationshipHealthScore.conflictInsightsScore || 0) +
          (analysis.relationshipHealthScore.rolesTendenciesScore || 0);
      }

      const report = analysis as AnalysisReport;
      // mark this report as a comparison reanalysis
      report.isComparison = true;

      // Attempt to save history if enabled for this user (include source text)
      if (userId) {
        try {
          await this.saveAnalysisHistory(userId, report, text);
        } catch (e) {
          // don't fail the analysis if saving history fails
          console.warn('Failed to save analysis history:', e);
        }
      }

      return report;
    } catch (error: any) {
      console.error('Gemini API analysis error:', error);

      if (error instanceof SyntaxError) {
        throw new InternalServerErrorException(
          'Failed to parse Gemini API response. The response was not valid JSON.',
        );
      }

      if (error.status === 429) {
        throw new InternalServerErrorException(
          'Gemini API rate limit exceeded. Please try again later.',
        );
      }

      if (error.status === 401 || error.status === 403) {
        throw new InternalServerErrorException(
          'Gemini API authentication failed. Invalid or expired API key.',
        );
      }

      if (error.status >= 500) {
        throw new InternalServerErrorException(
          'Gemini API server error. Please try again later.',
        );
      }

      throw new InternalServerErrorException(
        'An error occurred during chat analysis. Please try again.',
      );
    }
  }

  async reanalyzeChat(
    reanalyzeDto: ReanalyzeDto,
    images?: any[],
    userId?: string,
  ): Promise<AnalysisReport> {
    const { text, historyId } = reanalyzeDto;

    // Validate input
    const hasValidImage =
      images && images.length && images.some((img) => img && img.buffer);
    if (!text && !hasValidImage) {
      throw new BadRequestException(
        'Please provide either text or at least one screenshot image of the chat to analyze.',
      );
    }

    if (!historyId) {
      throw new BadRequestException('historyId is required for reanalysis.');
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Gemini API key is not configured. Please set GEMINI_API_KEY environment variable.',
      );
    }

    try {
      const uid =
        typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

      // Fetch existing history record to compare against
      const existing = await this.historyModel.findOne({
        _id: new Types.ObjectId(historyId),
        user: uid,
      });
      if (!existing) {
        throw new BadRequestException('Existing history record not found.');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const comparisonInstruction = `
You are performing a comparison re-analysis. Below is the prior analysis JSON for the earlier conversation. Compare the new conversation (provided as text or images) with the prior analysis and produce an updated analysis REPORT using the exact same 6-section JSON schema as before. Be sure to reflect any differences in scores, markers, conflict insights, roles/tendencies, and tips. Do NOT add any extra fields. Return ONLY valid JSON exactly matching the AnalysisReport schema.

Previous analysis JSON:
${JSON.stringify(existing.report || {})}
`;

      const prompt = `
You are an expert relationship communication analyzer. Your task is to analyze a conversation and generate the same 6-section relationship health report as usual, but this is a COMPARISON reanalysis: compare the new conversation to the previous analysis provided and update the report accordingly.

IMPORTANT: Return ONLY valid JSON - no additional text before or after.

${comparisonInstruction}

${
  text
    ? `Text conversation to analyze:
"${text}"`
    : 'Conversation screenshot provided as image below. Please extract and analyze all visible conversation content.'
}

Guidelines:
- Use ONLY information from the conversation (text or image) and the provided previous analysis when deciding what changed.
- Do not diagnose personalities or conditions.
- Do not guess beyond what is shown.
- Be objective and factual.
- Scoring must be between 0-100.
`;

      const parts: any[] = [{ text: prompt }];

      if (images && images.length) {
        for (const img of images) {
          if (img && img.buffer) {
            parts.push(this.fileToGenerativePart(img.buffer, img.mimetype));
          }
        }
      }

      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const responseText = result.response.text();
      const analysis = JSON.parse(responseText);

      // Validate structure
      if (!analysis.relationshipHealthScore || !analysis.rolesAndTendencies) {
        throw new InternalServerErrorException(
          'Invalid analysis response structure from Gemini API.',
        );
      }

      if (!analysis.relationshipHealthScore.totalScore) {
        analysis.relationshipHealthScore.totalScore =
          (analysis.relationshipHealthScore.positiveMarkersScore || 0) +
          (analysis.relationshipHealthScore.negativeMarkersScore || 0) +
          (analysis.relationshipHealthScore.conflictInsightsScore || 0) +
          (analysis.relationshipHealthScore.rolesTendenciesScore || 0);
      }

      const report = analysis as AnalysisReport;

      // Prefix the resultText to indicate this is a comparison update
      const prefixedResultText =
        `Comparison update (compared with history ${historyId}): ` +
        this.formatReportText(report);

      // Overwrite the existing history record (no new record should be created)
      try {
        await this.historyModel.findOneAndUpdate(
          { _id: new Types.ObjectId(historyId), user: uid },
          {
            $set: {
              report,
              totalScore: report.relationshipHealthScore.totalScore,
              sourceText: text,
              resultText: prefixedResultText,
            },
          },
          { new: true },
        );
      } catch (e) {
        console.warn('Failed to update analysis history during reanalysis:', e);
      }

      // Send push if enabled
      try {
        const settings = await this.settingsModel.findOne({ user: uid }).lean();
        if (settings?.pushEnabled) {
          await this.sendPushNotification(uid as Types.ObjectId, {
            title: 'Reanalysis Complete',
            body: `Your reanalysis score: ${report.relationshipHealthScore.totalScore}`,
            data: {
              score: report.relationshipHealthScore.totalScore,
              id: historyId,
            },
          });
        }
      } catch (e) {
        console.warn('Push notification failed after reanalysis:', e);
      }

      return report;
    } catch (error: any) {
      console.error('Gemini API reanalysis error:', error);
      if (error instanceof SyntaxError) {
        throw new InternalServerErrorException(
          'Failed to parse Gemini API response. The response was not valid JSON.',
        );
      }
      if (error.status === 429) {
        throw new InternalServerErrorException(
          'Gemini API rate limit exceeded. Please try again later.',
        );
      }
      if (error.status === 401 || error.status === 403) {
        throw new InternalServerErrorException(
          'Gemini API authentication failed. Invalid or expired API key.',
        );
      }
      if (error.status >= 500) {
        throw new InternalServerErrorException(
          'Gemini API server error. Please try again later.',
        );
      }
      throw new InternalServerErrorException(
        'An error occurred during reanalysis. Please try again.',
      );
    }
  }

  private async saveAnalysisHistory(
    userId: string | Types.ObjectId,
    report: AnalysisReport,
    sourceText?: string,
  ) {
    const uid =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const settings = await this.settingsModel.findOne({ user: uid }).lean();
    if (settings && settings.saveHistory === false) return;

    const totalScore = report?.relationshipHealthScore?.totalScore;

    const resultText = this.formatReportText(report);

    const created = await this.historyModel.create({
      user: uid,
      report,
      totalScore,
      sourceText,
      resultText,
    });

    // If push notifications are enabled for this user, send a push (placeholder implementation)
    if (settings?.pushEnabled) {
      try {
        await this.sendPushNotification(uid, {
          title: 'Analysis Complete',
          body: `Your latest analysis score: ${totalScore}`,
          data: { score: totalScore, id: created._id?.toString?.() },
        });
      } catch (e) {
        console.warn('Push notification failed:', e);
      }
    }
  }

  async setPushNotif(userId: string | Types.ObjectId, pushEnabled: boolean) {
    const uid =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const res = await this.settingsModel.findOneAndUpdate(
      { user: uid },
      { $set: { pushEnabled } },
      { upsert: true, new: true },
    );
    return { ok: true, settings: res };
  }

  private async sendPushNotification(
    userId: Types.ObjectId,
    payload: { title: string; body: string; data?: any },
  ) {
    // Placeholder: integrate with real push service (FCM, OneSignal, etc.) here.
    // For now just log the payload. This ensures places that call push are guarded by settings.
    console.log('SendPushNotification', userId.toString(), payload);
    return Promise.resolve(true);
  }

  private formatReportText(report: AnalysisReport) {
    if (!report) return '';
    const score = report.relationshipHealthScore?.totalScore ?? null;
    const roles = (report.rolesAndTendencies || [])
      .map((r) => `${r.person}: ${r.communicationStyle}`)
      .join(' | ');
    const positives = (report.positiveMarkers || [])
      .slice(0, 3)
      .map((m) => m.title)
      .join(', ');
    const negatives = (report.negativeMarkers || [])
      .slice(0, 3)
      .map((m) => m.title)
      .join(', ');
    const tips = (report.improvementTips || []).slice(0, 5).join(' ');

    return `Score: ${score}. Roles: ${roles}. Positives: ${positives}. Negatives: ${negatives}. Tips: ${tips}`;
  }

  private extractTipsFromResultText(resultText?: string): string | null {
    if (!resultText) return null;
    const match = resultText.match(/Tips:\s*(.*)$/s);
    if (!match) return null;
    return match[1].trim() || null;
  }

  async setAverageDays(userId: string | Types.ObjectId, averageDays: number) {
    const uid =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const res = await this.settingsModel.findOneAndUpdate(
      { user: uid },
      { $set: { averageDays } },
      { upsert: true, new: true },
    );
    return { ok: true, settings: res };
  }

  async getAverageDays(userId: string | Types.ObjectId) {
    const uid =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const settings = await this.settingsModel.findOne({ user: uid }).lean();
    const averageDays = settings?.averageDays ?? 30;
    return { averageDays };
  }

  async getDashboard(userId: string | Types.ObjectId) {
    const uid =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

    const settings = await this.settingsModel.findOne({ user: uid }).lean();
    const days = settings?.averageDays ?? 30;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const records = await this.historyModel
      .find({ user: uid, createdAt: { $gte: cutoff } })
      .lean();

    const scores = records
      .map((r) => (typeof r.totalScore === 'number' ? r.totalScore : undefined))
      .filter((s) => typeof s === 'number') as number[];
    const averageScore = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;

    const daySet = new Set(
      records
        .map((r) =>
          r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : null,
        )
        .filter((d): d is string => Boolean(d)),
    );
    const activeDays = daySet.size;
    const activeDaysPercent =
      days > 0 ? Math.round((activeDays / days) * 100) : 0;

    const last = await this.historyModel
      .findOne({ user: uid })
      .sort({ createdAt: -1 })
      .lean();

    return {
      averageDays: days,
      averageScore,
      activeDays,
      activeDaysPercent,
      lastAnalysisText: last?.resultText ?? null,
      lastAnalysisTips: this.extractTipsFromResultText(last?.resultText),
      lastAnalysisAt: last?.createdAt ?? null,
    };
  }

  async submitReport(
    userId: string | Types.ObjectId,
    historyId: string,
    file: Express.Multer.File,
  ) {
    const uid =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    if (!historyId) {
      throw new BadRequestException('historyId is required');
    }
    if (!file || !file.buffer) {
      throw new BadRequestException('PDF file is required');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are allowed');
    }

    const historyEntry = await this.historyModel.findOne({
      _id: new Types.ObjectId(historyId),
      user: uid,
    });

    if (!historyEntry) {
      throw new BadRequestException('Analysis history record not found');
    }

    await this.ensureReportStoragePath();

    if (historyEntry.reportFilePath) {
      try {
        await fs.promises.unlink(historyEntry.reportFilePath);
      } catch (e) {
        // ignore missing old file
      }
    }

    const fileName = `${historyId}-${Date.now()}.pdf`;
    const filePath = path.join(this.reportStoragePath, fileName);
    await fs.promises.writeFile(filePath, file.buffer);

    historyEntry.reportFileName = file.originalname;
    historyEntry.reportFileMimeType = file.mimetype;
    historyEntry.reportFileSize = file.size;
    historyEntry.reportFilePath = filePath;
    historyEntry.reportSubmittedAt = new Date();

    await historyEntry.save();

    return {
      ok: true,
      historyId,
      reportFileName: file.originalname,
      reportFileSize: file.size,
      reportSubmittedAt: historyEntry.reportSubmittedAt,
    };
  }

  async getReportFile(userId: string | Types.ObjectId, historyId: string) {
    const uid =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    if (!historyId) {
      throw new BadRequestException('historyId is required');
    }

    const historyEntry = await this.historyModel.findOne({
      _id: new Types.ObjectId(historyId),
      user: uid,
    });

    if (!historyEntry || !historyEntry.reportFilePath) {
      throw new NotFoundException('Report file not found');
    }

    try {
      await fs.promises.access(historyEntry.reportFilePath);
    } catch (e) {
      throw new NotFoundException('Report file not found');
    }

    return {
      reportFileName: historyEntry.reportFileName,
      reportFileMimeType: historyEntry.reportFileMimeType,
      reportFilePath: historyEntry.reportFilePath,
    };
  }

  async getHistory(userId: string | Types.ObjectId, filter: string) {
    const uid =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

    const baseQuery = this.historyModel
      .find({ user: uid })
      .select('-reportFile -reportFileName -reportFileMimeType -reportFileSize');

    const mapReportUrl = (entry: any) => {
      const reportFileUrl = entry?.reportFilePath
        ? `/analysis/report/${entry._id}`
        : null;
      const { reportFilePath, ...rest } = entry;
      return {
        ...rest,
        reportFileUrl,
      };
    };

    switch (filter) {
      // Show all records sorted by newest first
      case 'Latest': {
        const records = await baseQuery.sort({ createdAt: -1 }).lean();
        return records.map(mapReportUrl);
      }

      // Sort by totalScore high -> low, then newest first
      case 'High': {
        const records = await baseQuery
          .sort({ totalScore: -1, createdAt: -1 })
          .lean();
        return records.map(mapReportUrl);
      }

      // Sort by totalScore low -> high, then newest first
      case 'Low': {
        const records = await baseQuery.sort({ totalScore: 1, createdAt: -1 }).lean();
        return records.map(mapReportUrl);
      }

      // Default: return all records newest first
      case 'All':
      default: {
        const records = await baseQuery.sort({ createdAt: -1 }).lean();
        return records.map(mapReportUrl);
      }
    }
  }

  async deleteHistory(userId: string | Types.ObjectId, id?: string) {
    const uid =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    if (id) {
      const oid = new Types.ObjectId(id);
      return this.historyModel.deleteOne({ _id: oid, user: uid });
    }
    return this.historyModel.deleteMany({ user: uid });
  }

  async deleteAllHistory(userId: string | Types.ObjectId) {
    const uid =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    return this.historyModel.deleteMany({ user: uid });
  }

  async setSaveHistory(userId: string | Types.ObjectId, saveHistory: boolean) {
    const uid =
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const res = await this.settingsModel.findOneAndUpdate(
      { user: uid },
      { $set: { saveHistory } },
      { upsert: true, new: true },
    );
    return { ok: true, settings: res };
  }
}
