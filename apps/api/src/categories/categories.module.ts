import { Module } from '@nestjs/common';

import { CommandsModule } from '../commands/commands.module';
import { DatabaseModule } from '../database/database.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [DatabaseModule, CommandsModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
