import { Module } from '@nestjs/common';

import { CommandsModule } from '../commands/commands.module';
import { DatabaseModule } from '../database/database.module';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  imports: [DatabaseModule, CommandsModule],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
