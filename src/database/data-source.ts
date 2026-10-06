import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { validateEnvironment } from '../config/environment';
import { databaseOptions } from './options';
config({ quiet: true });
export default new DataSource(databaseOptions(validateEnvironment(process.env)));
