import { ApiProperty } from '@nestjs/swagger';

export class ModuleListItemDto {
  @ApiProperty({ description: 'Module ID' })
  id: string;

  @ApiProperty({ description: 'Module name' })
  name: string;
}
