import { Module } from '@nestjs/common';
import { NodeDefinitionService } from './node-definition.service';
import { NodeDefinitionController } from './node-definition.controller';

@Module({
  controllers: [NodeDefinitionController],
  providers: [NodeDefinitionService],
  exports: [NodeDefinitionService],
})
export class NodeDefinitionModule {}
