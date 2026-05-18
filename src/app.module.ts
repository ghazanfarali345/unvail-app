import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { AnalysisModule } from './analysis/analysis.module';
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const mailHost = configService.get<string>('MAIL_HOST');
        console.log(`[CONFIG DIAGNOSTIC] MAIL_HOST loaded from environment: "${mailHost}"`);
        return {
          transport: {
            host: mailHost,
            port: configService.get<number>('MAIL_PORT'),
            secure: configService.get<number>('MAIL_PORT') === 465, // usually false for 587
            auth: {
              user: configService.get<string>('MAIL_USER'),
              pass: configService.get<string>('MAIL_PASSWORD'),
            },
          },
          defaults: {
            from: `"${configService.get<string>('MAIL_NAME')}" <${configService.get<string>('MAIL_FROM')}>`,
          },
        };
      },
    }),
    DatabaseModule,
    AuthModule,
    UserModule,
    AnalysisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
