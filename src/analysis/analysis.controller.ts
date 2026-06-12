import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Get,
  Query,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import { AnalyzeChatDto, AnalysisReport } from './dto/analyze-chat.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Express } from 'express';
import { GetUser } from '../common/decorators/get-user.decorator';
import { HistoryFilterDto } from './dto/history-filter.dto';
import { SaveHistoryDto } from './dto/save-history.dto';
import { AverageDaysDto } from './dto/average-days.dto';
import { PushNotifDto } from './dto/push-notif.dto';

@ApiTags('Analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('analyze')
  @ApiOperation({
    summary:
      'Analyze couple chat conversation and generate relationship health report',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  @ApiResponse({
    status: 200,
    description:
      'Successful analysis returning 6-section report: Health Score, Roles & Tendencies, Positive/Negative Markers, Conflict Insights, and Improvement Tips',
  })
  async analyzeChat(
    @GetUser() user: any,
    @Body() analyzeChatDto: AnalyzeChatDto,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<AnalysisReport> {
    return this.analysisService.analyzeChat(analyzeChatDto, image, user._id);
  }

  @Get('history')
  @ApiOperation({
    summary:
      'Get analysis history with optional filter (All, Latest, High, Low)',
  })
  @ApiQuery({ name: 'filter', required: false, enum: ['All', 'Latest', 'High', 'Low'] })
  @ApiResponse({ status: 200, description: 'Returns analysis history list or filtered results' })
  async getHistory(@GetUser() user: any, @Query() filterDto: HistoryFilterDto) {
    return this.analysisService.getHistory(user._id, filterDto.filter || 'All');
  }

  @Delete('history')
  @ApiOperation({
    summary:
      'Delete analysis history for user. Optional query param `id` to delete specific record.',
  })
  @ApiQuery({ name: 'id', required: false, description: 'Optional history record id to delete' })
  @ApiResponse({ status: 200, description: 'Deletion result' })
  async deleteHistory(@GetUser() user: any, @Query('id') id?: string) {
    return this.analysisService.deleteHistory(user._id, id);
  }

  @Delete('history/all')
  @ApiOperation({ summary: 'Delete all analysis history for the authenticated user' })
  @ApiResponse({ status: 200, description: 'All history deleted for the user' })
  async deleteAllHistory(@GetUser() user: any) {
    return this.analysisService.deleteAllHistory(user._id);
  }

  @Post('config/save-history')
  @ApiOperation({
    summary: 'Enable or disable saving analysis history for the user',
  })
  @ApiResponse({ status: 200, description: 'Updated user analysis settings' })
  async setSaveHistory(@GetUser() user: any, @Body() dto: SaveHistoryDto) {
    return this.analysisService.setSaveHistory(user._id, dto.saveHistory);
  }

  @Post('config/average-days')
  @ApiOperation({ summary: 'Set number of days used to compute dashboard average' })
  @ApiResponse({
    status: 200,
    description: 'Updated averageDays setting',
    schema: {
      example: {
        ok: true,
        settings: {
          _id: '60d0fe4f5311236168a109ca',
          user: '60d0fe4f5311236168a109cb',
          saveHistory: true,
          retentionDays: 30,
          averageDays: 7,
          createdAt: '2026-06-12T00:00:00.000Z',
          updatedAt: '2026-06-12T00:00:00.000Z'
        }
      }
    }
  })
  async setAverageDays(@GetUser() user: any, @Body() dto: AverageDaysDto) {
    return this.analysisService.setAverageDays(user._id, dto.averageDays);
  }

  @Post('config/push-notif')
  @ApiOperation({ summary: 'Enable or disable push notifications for analysis results' })
  @ApiResponse({ status: 200, description: 'Updated push notification setting' })
  async setPushNotif(@GetUser() user: any, @Body() dto: PushNotifDto) {
    return this.analysisService.setPushNotif(user._id, dto.pushEnabled);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard summary: average score and last analysis text' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data including averageScore and lastAnalysisText',
    schema: {
      example: {
        averageDays: 7,
        averageScore: 78.25,
        lastAnalysisText: "Hey, I'm worried about our communication lately...",
        lastAnalysisAt: '2026-06-12T12:34:56.000Z'
      }
    }
  })
  async getDashboard(@GetUser() user: any) {
    return this.analysisService.getDashboard(user._id);
  }
}
