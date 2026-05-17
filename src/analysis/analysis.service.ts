import { Injectable } from '@nestjs/common';
import { AnalyzeChatDto } from './dto/analyze-chat.dto';

@Injectable()
export class AnalysisService {
  private extractNames(text?: string): string[] {
    if (!text) return [];
    
    // Match common chat formats: 
    // "[date, time] Name:" 
    // "date, time - Name:"
    // "Name:"
    const nameRegex = /^(?:\[[^\]]+\]\s*|\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:am|pm)?\s*-\s*)?([^:\n]+):/gm;
    const names = new Set<string>();
    let match;

    while ((match = nameRegex.exec(text)) !== null) {
      if (match[1]) {
        names.add(match[1].trim());
      }
    }
    
    return Array.from(names);
  }

  async analyzeChat(analyzeChatDto: AnalyzeChatDto) {
    // For now, this is a static response. In the future, this will call an AI API.
    const { text } = analyzeChatDto;

    let user1Name = 'User 1';
    let user2Name = 'User 2';

    // Parse names from text
    if (text) {
      const parsedNames = this.extractNames(text);
      if (parsedNames.length >= 1) user1Name = parsedNames[0];
      if (parsedNames.length >= 2) user2Name = parsedNames[1];
    }

    return {
      score: 85, // Score out of 100
      stabilityIndex: 78, // Stability index for the frontend slider
      personalities: {
        user1: {
          name: user1Name || 'User 1',
          adjectives: ['Constructive Organizer', 'Empathetic Listener'],
        },
        user2: {
          name: user2Name || 'User 2',
          adjectives: ['Proactive Collaborator', 'Logical Thinker'],
        },
      },
      unveiledPaths: [
        {
          title: 'Path of Mutual Understanding',
          description: 'Focus on shared goals to strengthen your foundational bond and deepen mutual trust.',
        },
        {
          title: 'Path of Emotional Growth',
          description: 'Develop deeper empathy through active listening and open communication during conflicts.',
        },
        {
          title: 'Path of Dynamic Synergy',
          description: 'Balance each other\'s strengths by allowing your constructive organization to pair with their proactive collaboration.',
        },
      ],
    };
  }
}
