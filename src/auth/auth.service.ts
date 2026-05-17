import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { MailerService } from '@nestjs-modules/mailer';
import { User, UserDocument } from './schemas/user.schema';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private readonly mailerService: MailerService,
  ) {}

  async signup(signupDto: SignupDto) {
    const { email, password, firstName, lastName, phone } = signupDto;

    const userExists = await this.userModel.findOne({ email });
    if (userExists) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.userModel.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone,
      isActive: false, // User must verify email
    });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    user.otpCode = hashedOtp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Welcome to Unveil App - Verify Your Email',
        text: `Your email verification OTP is: ${otp}. It is valid for 10 minutes.`,
        html: `<p>Your email verification OTP is: <strong>${otp}</strong>. It is valid for 10 minutes.</p>`,
      });
      console.log(`Signup OTP sent to ${email}`);
    } catch (error) {
      console.error(`Failed to send signup email to ${email}:`, error);
    }

    return { 
      message: 'Registration successful. Please check your email for the verification OTP.',
      otp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.userModel.findOne({ email });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateToken(user);
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    const user = await this.userModel.findOne({ email });

    if (!user) {
      // For security, don't reveal if user exists. Just return success.
      return { message: 'If an account exists, an OTP has been sent.' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    user.otpCode = hashedOtp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.otpVerified = false;
    await user.save();

    // Send email using MailerService
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Password Reset OTP - Unveil App',
        text: `Your OTP for password reset is: ${otp}. It is valid for 10 minutes.`,
        html: `<p>Your OTP for password reset is: <strong>${otp}</strong>. It is valid for 10 minutes.</p>`,
      });
      console.log(`OTP sent to ${email} via email.`);
    } catch (error) {
      console.error(`Failed to send email to ${email}:`, error);
    }

    return {
      message: 'OTP sent to your email',
      // DO NOT return OTP in production. Only for dev/testing.
      otp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    };
  }

  async verifyEmail(verifyOtpDto: VerifyOtpDto) {
    const { email, otp } = verifyOtpDto;
    const user = await this.userModel.findOne({ email });

    if (!user || !user.otpCode || !user.otpExpires || user.otpExpires < new Date()) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const isOtpValid = await bcrypt.compare(otp, user.otpCode);
    if (!isOtpValid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Clear OTP fields since it was successful
    user.otpCode = undefined;
    user.otpExpires = undefined;
    user.otpVerified = true;

    if (!user.isActive) {
      // This is an account activation via OTP
      user.isActive = true;
      await user.save();
      return this.generateToken(user);
    } else {
      // This is a password reset OTP verification
      await user.save();
      return { message: 'OTP verified successfully. You can now reset your password.' };
    }
  }

  async resendOtp(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    const user = await this.userModel.findOne({ email });

    if (!user) {
      // Don't reveal if user exists.
      return { message: 'If an account exists, a new OTP has been sent.' };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    user.otpCode = hashedOtp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.otpVerified = false;
    await user.save();

    // Send email using MailerService
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'New OTP - Unveil App',
        text: `Your new OTP is: ${otp}. It is valid for 10 minutes.`,
        html: `<p>Your new OTP is: <strong>${otp}</strong>. It is valid for 10 minutes.</p>`,
      });
      console.log(`New OTP sent to ${email} via email.`);
    } catch (error) {
      console.error(`Failed to send email to ${email}:`, error);
    }

    return {
      message: 'A new OTP has been sent to your email',
      otp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, newPassword, confirmPassword } = resetPasswordDto;

    if (newPassword !== confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.userModel.findOne({ email });

    if (!user || !user.otpVerified) {
      throw new BadRequestException('OTP not verified');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    user.otpVerified = false;
    await user.save();

    return { message: 'Password reset successful' };
  }

  private generateToken(user: UserDocument) {
    const payload = { email: user.email, sub: user._id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }
}
