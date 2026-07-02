// Loads the dev environment before any test module (and therefore @/lib/db,
// which reads DATABASE_URL at import time) is evaluated.
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
