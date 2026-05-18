import { Controller, Post, Body, UseInterceptors, UploadedFile, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBearerAuth } from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import { AnalyzeChatDto } from './dto/analyze-chat.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Express } from 'express';

@ApiTags('Analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze chat text or screenshot to evaluate couple bond' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  @ApiResponse({ status: 200, description: 'Successful analysis returning scores, personalities, and paths' })
  async analyzeChat(
    @Body() analyzeChatDto: AnalyzeChatDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    // Note: 'image' is extracted via the FileInterceptor. 
    // The dto validation handles 'text'.
    return this.analysisService.analyzeChat(analyzeChatDto, image);
  }
}
