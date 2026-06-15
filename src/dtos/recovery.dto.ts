import { IsString, IsNotEmpty, IsArray, IsOptional, IsObject, IsBoolean, IsNumber } from 'class-validator';
import { ContaminationLevel } from '../enums';

export interface InstrumentItem {
  instrumentId: string;
  instrumentCode: string;
  instrumentName: string;
  expectedQuantity: number;
  actualQuantity: number;
  status: 'normal' | 'missing' | 'damaged';
  damageDescription?: string;
}

export class CreatePackageDto {
  @IsString()
  @IsNotEmpty()
  barcode: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  departmentId: string;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsOptional()
  contaminationLevel?: ContaminationLevel;

  @IsArray()
  @IsOptional()
  instrumentItems?: InstrumentItem[];
}

export class ScanBarcodeDto {
  @IsString()
  @IsNotEmpty()
  barcode: string;
}

export class RecoveryInspectionDto {
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @IsArray()
  @IsNotEmpty()
  instrumentItems: InstrumentItem[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsOptional()
  contaminationLevel?: ContaminationLevel;
}

export class RejectPackageDto {
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @IsString()
  @IsNotEmpty()
  rejectionReason: string;

  @IsObject()
  @IsOptional()
  inspectionResult?: {
    missingItems: any[];
    damagedItems: any[];
    totalMissingCount: number;
    totalDamagedCount: number;
  };
}

export class UpdatePackageDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsOptional()
  contaminationLevel?: ContaminationLevel;

  @IsArray()
  @IsOptional()
  instrumentItems?: InstrumentItem[];

  @IsBoolean()
  @IsOptional()
  isLocked?: boolean;

  @IsString()
  @IsOptional()
  lockReason?: string;
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @IsOptional()
  validDays?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsNotEmpty()
  items: Array<{
    instrumentId: string;
    requiredQuantity: number;
  }>;
}

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  validDays?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  items?: Array<{
    instrumentId: string;
    requiredQuantity: number;
  }>;
}
