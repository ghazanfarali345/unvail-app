import { Controller, Post, Body, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import { AnalyzeChatDto, AnalysisReport } from './dto/analyze-chat.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Express } from 'express';

@ApiTags('Analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze couple chat conversation and generate relationship health report' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  @ApiResponse({ 
    status: 200, 
    description: 'Successful analysis returning 6-section report: Health Score, Roles & Tendencies, Positive/Negative Markers, Conflict Insights, and Improvement Tips' 
  })
  async analyzeChat(
    @Body() analyzeChatDto: AnalyzeChatDto,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<AnalysisReport> {
    return this.analysisService.analyzeChat(analyzeChatDto, image);
  }
}
