import { IsString, IsNotEmpty, IsObject, IsOptional, IsBoolean, IsNumber, IsArray } from 'class-validator';
import { ContaminationLevel, CleaningProgram } from '../enums';

export interface CleaningParameters {
  waterTemperature: number;
  detergentConcentration: number;
  cleaningDuration: number;
  rinseCount: number;
  dryingTemperature: number;
  dryingDuration: number;
  phValue: number;
  conductivity: number;
}

export class CreateCleaningTaskDto {
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @IsOptional()
  assignedProgram?: CleaningProgram;

  @IsOptional()
  equipmentId?: string;
}

export class StartCleaningTaskDto {
  @IsString()
  @IsNotEmpty()
  taskId: string;
}

export class CompleteCleaningTaskDto {
  @IsString()
  @IsNotEmpty()
  taskId: string;

  @IsObject()
  @IsNotEmpty()
  runParameters: CleaningParameters;

  @IsBoolean()
  @IsOptional()
  isSuccessful?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export interface ParameterRange {
  min: number;
  max: number;
  unit: string;
}

export interface ProgramConfig {
  program: CleaningProgram;
  applicableLevels: ContaminationLevel[];
  parameters: Record<keyof CleaningParameters, ParameterRange>;
  duration: number;
}

export class UpdateCleaningTaskDto {
  @IsOptional()
  assignedProgram?: CleaningProgram;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class WorkOrderDto {
  @IsString()
  @IsNotEmpty()
  equipmentId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  assignedEngineerId?: string;
}

export class UpdateWorkOrderDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  resolution?: string;

  @IsString()
  @IsOptional()
  repairNotes?: string;

  @IsNumber()
  @IsOptional()
  actualCost?: number;
}

export class AssignWorkOrderDto {
  @IsString()
  @IsNotEmpty()
  workOrderId: string;

  @IsString()
  @IsNotEmpty()
  engineerId: string;
}
