import { InfluxDB, Point } from '@influxdata/influxdb-client';
import * as InfluxV1 from 'influx';
import { readFileSync } from 'fs';
import path from 'path';

import { Account } from './interface/Account';
import { log } from './util/Logger';
type LogFunction = typeof log;

const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const influxConfig = config.influxdb;

let influxClient: any;
let isV2 = false;

// Logica di selezione della versione
if (influxConfig?.version && influxConfig.version !== 0) {
    if (influxConfig.version === 2) {
        isV2 = true;
        const { url, token, org, bucket } = influxConfig.v2;
        if (url && token && org && bucket) {
            influxClient = new InfluxDB({ url, token }).getWriteApi(org, bucket);
            log(false, 'INFLUXDB', 'InfluxDB v2 client initialized.');
        }
    } else if (influxConfig.version === 1) {
        isV2 = false;
        const { host, database } = influxConfig.v1;
        if (host && database) {
            influxClient = new InfluxV1.InfluxDB(influxConfig.v1);
            log(false, 'INFLUXDB', 'InfluxDB v1 client initialized.');
        }
    }
}

/**
 * Scrive i punti correnti su InfluxDB
 */
export async function writePoints(account: Account, points: number, log: LogFunction, pointType: 'initial' | 'final') {
    // Il controllo corretto che non usa la variabile "isEnabled"
    if (!influxConfig?.version || influxConfig.version === 0 || !influxClient) {
        return;
    }

    const versionType = isV2 ? 'v2' : 'v1';

    try {
        if (isV2) {
            const dataPoint = new Point('reward_points')
                .tag('email', account.email)
                .tag('type', pointType)
                .intField('points', points);
            influxClient.writePoint(dataPoint);
            await influxClient.flush();
        } else {
            await influxClient.writePoints([{
                measurement: 'reward_points',
                tags: { email: account.email, type: pointType },
                fields: { points: points },
            }]);
        }
        log(false, 'INFLUXDB', `Successfully wrote ${points} points for ${account.email} (${pointType}) to InfluxDB (${versionType}).`);
    } catch (error) {
        const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
        log(false, 'INFLUXDB', `Error writing to InfluxDB: ${errorDetails}`, 'error');
    }
}