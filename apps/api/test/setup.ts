import 'reflect-metadata';
import { loadDotEnv } from '../src/config/load-dot-env';

loadDotEnv();
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
