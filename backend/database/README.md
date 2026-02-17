# IT Ticketing System Database

This directory contains the database schema and initialization scripts for the IT Ticketing System.

## Files

- `schema.sql` - Complete database schema with all tables and indexes
- `init.sql` - Sample data insertion script
- `README.md` - This documentation file

## Database Structure

### Tables

1. **users** - Stores user information and authentication data
2. **shifts** - Defines work shifts (AM, PM, GY)
3. **tickets** - Main ticket tracking table
4. **sla_tracking** - SLA compliance tracking for tickets

## Setup Instructions

### Using MySQL Command Line

1. Start MySQL server
2. Run the schema creation:
   ```bash
   mysql -u root -p < schema.sql
   ```
3. Initialize with sample data:
   ```bash
   mysql -u root -p < init.sql
   ```

### Default Users

- **Admin**: username: `admin`, password: `admin123`
- **Agent 1**: username: `agent1`, password: `admin123`
- **Agent 2**: username: `agent2`, password: `admin123`
- **User 1**: username: `user1`, password: `admin123`
- **User 2**: username: `user2`, password: `admin123`

## Shift Schedule

- **AM Shift**: 06:00 - 14:00
- **PM Shift**: 14:00 - 22:00
- **GY Shift**: 22:00 - 06:00

## Notes

- All passwords are hashed using bcrypt
- The database includes proper foreign key constraints
- Indexes are created for performance optimization
- SLA tracking supports time accumulation across shifts
