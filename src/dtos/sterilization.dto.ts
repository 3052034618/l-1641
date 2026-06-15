import { IsString, IsNotEmpty, IsNumber, IsOptional, IsBoolean, IsObject, IsArray } from 'class-validator';
import { SterilizationStatus } from '../enums';

export class CreateSterilizationBatchDto {
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @IsString()
  @IsNotEmpty()
  equipmentId: string;
}

export class StartSterilizationDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;
}

export class SterilizationDataDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @IsNumber()
  @IsNotEmpty()
  temperature: number;

  @IsNumber()
  @IsNotEmpty()
  pressure: number;
}

export class CompleteSterilizationDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @IsOptional()
  isManualOverride?: boolean;
}

export class ReinspectBatchDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @IsBoolean()
  @IsNotEmpty()
  isPassed: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UnlockBatchDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

export interface SterilizationThresholds {
  minTemperature: number;
  maxTemperature: number;
  minPressure: number;
  maxPressure: number;
}

export interface AnomalyRecord {
  id: string;
  recordTime: Date;
  temperature: number;
  pressure: number;
  isTemperatureAbnormal: boolean;
  isPressureAbnormal: boolean;
  anomalyDetails: {
    temperatureStatus: 'normal' | 'over' | 'under';
    pressureStatus: 'normal' | 'over' | 'under';
    expectedTempRange: string;
    expectedPressureRange: string;
  };
}

export class UpdateBatchDto {
  @IsString()
  @IsOptional()
  equipmentId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export interface BatchFinalResult {
  averageTemperature: number;
  averagePressure: number;
  totalDuration: number;
  temperatureAnomalies: number;
  pressureAnomalies: number;
  isPassed: boolean;
  failedReason: string;
}
