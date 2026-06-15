import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateDistributionDto {
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @IsString()
  @IsNotEmpty()
  toDepartmentId: string;

  @IsString()
  @IsNotEmpty()
  receiverId: string;
}

export class VerifyPackageDto {
  @IsString()
  @IsNotEmpty()
  packageId: string;
}

export class ScanTagDto {
  @IsString()
  @IsNotEmpty()
  tagCode: string;
}

export class ConfirmReceiptDto {
  @IsString()
  @IsNotEmpty()
  distributionId: string;
}

export class UpdateDistributionDto {
  @IsString()
  @IsOptional()
  toDepartmentId?: string;

  @IsString()
  @IsOptional()
  receiverId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export interface ValidationResult {
  packageStatus: string;
  validUntil: Date;
  isValid: boolean;
  daysRemaining: number;
  isExpired: boolean;
  isLocked: boolean;
  lockReason: string;
  sterilizationInfo: {
    sterilizedAt: Date;
    batchCode: string;
    sterilizerCode: string;
  };
}

export class GenerateTagDto {
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @IsString()
  @IsNotEmpty()
  sterilizationBatchId: string;
}

export class CheckExpiredDto {
  @IsBoolean()
  @IsOptional()
  autoLock?: boolean;
}
