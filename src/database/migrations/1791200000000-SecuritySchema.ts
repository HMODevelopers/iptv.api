import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

export class SecuritySchema1791200000000 implements MigrationInterface {
  name = 'SecuritySchema1791200000000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.addColumn('channel_categories',new TableColumn({ name: 'isCurrent', type: 'tinyint', default: '1' }));
    await runner.addColumn('streams',new TableColumn({ name: 'isAvailable', type: 'tinyint', default: '1' }));
    await runner.createTable(new Table({
  "name": "users",
  "columns": [
    {
      "name": "id",
      "type": "int",
      "isGenerated": true,
      "generationStrategy": "increment",
      "isPrimary": true
    },
    {
      "name": "username",
      "type": "varchar",
      "length": "64"
    },
    {
      "name": "email",
      "type": "varchar",
      "length": "254"
    },
    {
      "name": "passwordHash",
      "type": "varchar",
      "length": "255"
    },
    {
      "name": "firstName",
      "type": "varchar",
      "length": "100"
    },
    {
      "name": "lastName",
      "type": "varchar",
      "length": "100",
      "default": "''"
    },
    {
      "name": "isActive",
      "type": "tinyint",
      "default": "1"
    },
    {
      "name": "requiresPasswordChange",
      "type": "tinyint",
      "default": "1"
    },
    {
      "name": "lastLoginAt",
      "type": "datetime",
      "isNullable": true
    },
    {
      "name": "failedLoginAttempts",
      "type": "int",
      "default": "0"
    },
    {
      "name": "lockedUntil",
      "type": "datetime",
      "isNullable": true
    },
    {
      "name": "createdAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)"
    },
    {
      "name": "updatedAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)",
      "onUpdate": "CURRENT_TIMESTAMP(6)"
    },
    {
      "name": "deletedAt",
      "type": "datetime",
      "precision": 6,
      "isNullable": true
    }
  ],
  "uniques": [
    {
      "name": "uq_users_username",
      "columnNames": [
        "username"
      ]
    },
    {
      "name": "uq_users_email",
      "columnNames": [
        "email"
      ]
    }
  ],
  "foreignKeys": [],
  "indices": [],
  "checks": []
}), false);
    await runner.createTable(new Table({
  "name": "roles",
  "columns": [
    {
      "name": "id",
      "type": "int",
      "isGenerated": true,
      "generationStrategy": "increment",
      "isPrimary": true
    },
    {
      "name": "name",
      "type": "varchar",
      "length": "64"
    },
    {
      "name": "description",
      "type": "varchar",
      "length": "255",
      "default": "''"
    },
    {
      "name": "isSystem",
      "type": "tinyint",
      "default": "0"
    },
    {
      "name": "isActive",
      "type": "tinyint",
      "default": "1"
    },
    {
      "name": "createdAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)"
    },
    {
      "name": "updatedAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)",
      "onUpdate": "CURRENT_TIMESTAMP(6)"
    }
  ],
  "uniques": [
    {
      "name": "uq_roles_name",
      "columnNames": [
        "name"
      ]
    }
  ],
  "foreignKeys": [],
  "indices": [],
  "checks": []
}), false);
    await runner.createTable(new Table({
  "name": "permissions",
  "columns": [
    {
      "name": "id",
      "type": "int",
      "isGenerated": true,
      "generationStrategy": "increment",
      "isPrimary": true
    },
    {
      "name": "code",
      "type": "varchar",
      "length": "64"
    },
    {
      "name": "description",
      "type": "varchar",
      "length": "255"
    },
    {
      "name": "module",
      "type": "varchar",
      "length": "64"
    },
    {
      "name": "createdAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)"
    }
  ],
  "uniques": [
    {
      "name": "uq_permissions_code",
      "columnNames": [
        "code"
      ]
    }
  ],
  "foreignKeys": [],
  "indices": [],
  "checks": []
}), false);
    await runner.createTable(new Table({
  "name": "auth_sessions",
  "columns": [
    {
      "name": "id",
      "type": "varchar",
      "length": "36",
      "isPrimary": true
    },
    {
      "name": "userId",
      "type": "int"
    },
    {
      "name": "refreshTokenHash",
      "type": "varchar",
      "length": "64"
    },
    {
      "name": "deviceName",
      "type": "varchar",
      "length": "100",
      "default": "''"
    },
    {
      "name": "userAgent",
      "type": "varchar",
      "length": "512",
      "default": "''"
    },
    {
      "name": "ipAddress",
      "type": "varchar",
      "length": "64",
      "default": "''"
    },
    {
      "name": "expiresAt",
      "type": "datetime"
    },
    {
      "name": "lastUsedAt",
      "type": "datetime"
    },
    {
      "name": "revokedAt",
      "type": "datetime",
      "isNullable": true
    },
    {
      "name": "createdAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)"
    }
  ],
  "uniques": [],
  "foreignKeys": [
    {
      "name": "fk_auth_sessions_userId",
      "columnNames": [
        "userId"
      ],
      "referencedTableName": "users",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    }
  ],
  "indices": [
    {
      "name": "idx_auth_sessions_userId",
      "columnNames": [
        "userId"
      ]
    },
    {
      "name": "idx_sessions_user_expiry",
      "columnNames": [
        "userId",
        "revokedAt",
        "expiresAt"
      ]
    }
  ],
  "checks": []
}), false);
    await runner.createTable(new Table({
  "name": "audit_logs",
  "columns": [
    {
      "name": "id",
      "type": "int",
      "isGenerated": true,
      "generationStrategy": "increment",
      "isPrimary": true
    },
    {
      "name": "userId",
      "type": "int",
      "isNullable": true
    },
    {
      "name": "action",
      "type": "varchar",
      "length": "100"
    },
    {
      "name": "module",
      "type": "varchar",
      "length": "64"
    },
    {
      "name": "entity",
      "type": "varchar",
      "length": "64"
    },
    {
      "name": "entityId",
      "type": "varchar",
      "length": "64",
      "isNullable": true
    },
    {
      "name": "ipAddress",
      "type": "varchar",
      "length": "64",
      "default": "''"
    },
    {
      "name": "result",
      "type": "varchar",
      "length": "32",
      "default": "'SUCCESS'"
    },
    {
      "name": "metadata",
      "type": "text",
      "isNullable": true
    },
    {
      "name": "createdAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)"
    }
  ],
  "uniques": [],
  "foreignKeys": [
    {
      "name": "fk_audit_logs_userId",
      "columnNames": [
        "userId"
      ],
      "referencedTableName": "users",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "SET NULL"
    }
  ],
  "indices": [
    {
      "name": "idx_audit_logs_userId",
      "columnNames": [
        "userId"
      ]
    }
  ],
  "checks": []
}), false);
    await runner.createTable(new Table({
  "name": "channel_publications",
  "columns": [
    {
      "name": "id",
      "type": "int",
      "isGenerated": true,
      "generationStrategy": "increment",
      "isPrimary": true
    },
    {
      "name": "channelId",
      "type": "int"
    },
    {
      "name": "status",
      "type": "varchar",
      "length": "16",
      "default": "'DRAFT'"
    },
    {
      "name": "publishedAt",
      "type": "datetime",
      "isNullable": true
    },
    {
      "name": "publishedBy",
      "type": "int",
      "isNullable": true
    },
    {
      "name": "createdAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)"
    },
    {
      "name": "updatedAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)",
      "onUpdate": "CURRENT_TIMESTAMP(6)"
    }
  ],
  "uniques": [
    {
      "name": "uq_channel_publications_channelId",
      "columnNames": [
        "channelId"
      ]
    }
  ],
  "foreignKeys": [
    {
      "name": "fk_channel_publications_channelId",
      "columnNames": [
        "channelId"
      ],
      "referencedTableName": "channels",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    },
    {
      "name": "fk_channel_publications_publishedBy",
      "columnNames": [
        "publishedBy"
      ],
      "referencedTableName": "users",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "SET NULL"
    }
  ],
  "indices": [
    {
      "name": "idx_channel_publications_channelId",
      "columnNames": [
        "channelId"
      ]
    },
    {
      "name": "idx_channel_publications_publishedBy",
      "columnNames": [
        "publishedBy"
      ]
    }
  ],
  "checks": [
    {
      "name": "chk_channel_publications_state",
      "expression": "`status` IN ('DRAFT','PUBLISHED','HIDDEN','DISABLED')"
    }
  ]
}), false);
    await runner.createTable(new Table({
  "name": "channel_collections",
  "columns": [
    {
      "name": "id",
      "type": "int",
      "isGenerated": true,
      "generationStrategy": "increment",
      "isPrimary": true
    },
    {
      "name": "name",
      "type": "varchar",
      "length": "100"
    },
    {
      "name": "description",
      "type": "text",
      "isNullable": true
    },
    {
      "name": "isActive",
      "type": "tinyint",
      "default": "1"
    },
    {
      "name": "createdBy",
      "type": "int",
      "isNullable": true
    },
    {
      "name": "createdAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)"
    },
    {
      "name": "updatedAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)",
      "onUpdate": "CURRENT_TIMESTAMP(6)"
    }
  ],
  "uniques": [],
  "foreignKeys": [
    {
      "name": "fk_channel_collections_createdBy",
      "columnNames": [
        "createdBy"
      ],
      "referencedTableName": "users",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "SET NULL"
    }
  ],
  "indices": [
    {
      "name": "idx_channel_collections_createdBy",
      "columnNames": [
        "createdBy"
      ]
    }
  ],
  "checks": []
}), false);
    await runner.createTable(new Table({
  "name": "channel_collection_items",
  "columns": [
    {
      "name": "id",
      "type": "int",
      "isGenerated": true,
      "generationStrategy": "increment",
      "isPrimary": true
    },
    {
      "name": "collectionId",
      "type": "int"
    },
    {
      "name": "channelId",
      "type": "int"
    },
    {
      "name": "position",
      "type": "int",
      "default": "0"
    },
    {
      "name": "createdAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)"
    }
  ],
  "uniques": [
    {
      "name": "uq_channel_collection_items_pair",
      "columnNames": [
        "collectionId",
        "channelId"
      ]
    }
  ],
  "foreignKeys": [
    {
      "name": "fk_channel_collection_items_collectionId",
      "columnNames": [
        "collectionId"
      ],
      "referencedTableName": "channel_collections",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    },
    {
      "name": "fk_channel_collection_items_channelId",
      "columnNames": [
        "channelId"
      ],
      "referencedTableName": "channels",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    }
  ],
  "indices": [
    {
      "name": "idx_channel_collection_items_collectionId",
      "columnNames": [
        "collectionId"
      ]
    },
    {
      "name": "idx_channel_collection_items_channelId",
      "columnNames": [
        "channelId"
      ]
    }
  ],
  "checks": []
}), false);
    await runner.createTable(new Table({
  "name": "user_channel_collections",
  "columns": [
    {
      "name": "id",
      "type": "int",
      "isGenerated": true,
      "generationStrategy": "increment",
      "isPrimary": true
    },
    {
      "name": "userId",
      "type": "int"
    },
    {
      "name": "collectionId",
      "type": "int"
    },
    {
      "name": "assignedBy",
      "type": "int",
      "isNullable": true
    },
    {
      "name": "assignedAt",
      "type": "datetime"
    },
    {
      "name": "revokedAt",
      "type": "datetime",
      "isNullable": true
    },
    {
      "name": "createdAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)"
    }
  ],
  "uniques": [
    {
      "name": "uq_user_channel_collections_pair",
      "columnNames": [
        "userId",
        "collectionId"
      ]
    }
  ],
  "foreignKeys": [
    {
      "name": "fk_user_channel_collections_userId",
      "columnNames": [
        "userId"
      ],
      "referencedTableName": "users",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    },
    {
      "name": "fk_user_channel_collections_collectionId",
      "columnNames": [
        "collectionId"
      ],
      "referencedTableName": "channel_collections",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    },
    {
      "name": "fk_user_channel_collections_assignedBy",
      "columnNames": [
        "assignedBy"
      ],
      "referencedTableName": "users",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "SET NULL"
    }
  ],
  "indices": [
    {
      "name": "idx_user_channel_collections_userId",
      "columnNames": [
        "userId"
      ]
    },
    {
      "name": "idx_user_channel_collections_collectionId",
      "columnNames": [
        "collectionId"
      ]
    },
    {
      "name": "idx_user_channel_collections_assignedBy",
      "columnNames": [
        "assignedBy"
      ]
    }
  ],
  "checks": []
}), false);
    await runner.createTable(new Table({
  "name": "user_channel_access",
  "columns": [
    {
      "name": "id",
      "type": "int",
      "isGenerated": true,
      "generationStrategy": "increment",
      "isPrimary": true
    },
    {
      "name": "userId",
      "type": "int"
    },
    {
      "name": "channelId",
      "type": "int"
    },
    {
      "name": "accessType",
      "type": "varchar",
      "length": "8"
    },
    {
      "name": "assignedBy",
      "type": "int",
      "isNullable": true
    },
    {
      "name": "createdAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)"
    },
    {
      "name": "updatedAt",
      "type": "datetime",
      "precision": 6,
      "default": "CURRENT_TIMESTAMP(6)",
      "onUpdate": "CURRENT_TIMESTAMP(6)"
    }
  ],
  "uniques": [
    {
      "name": "uq_user_channel_access_pair",
      "columnNames": [
        "userId",
        "channelId"
      ]
    }
  ],
  "foreignKeys": [
    {
      "name": "fk_user_channel_access_userId",
      "columnNames": [
        "userId"
      ],
      "referencedTableName": "users",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    },
    {
      "name": "fk_user_channel_access_channelId",
      "columnNames": [
        "channelId"
      ],
      "referencedTableName": "channels",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    },
    {
      "name": "fk_user_channel_access_assignedBy",
      "columnNames": [
        "assignedBy"
      ],
      "referencedTableName": "users",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "SET NULL"
    }
  ],
  "indices": [
    {
      "name": "idx_user_channel_access_userId",
      "columnNames": [
        "userId"
      ]
    },
    {
      "name": "idx_user_channel_access_channelId",
      "columnNames": [
        "channelId"
      ]
    },
    {
      "name": "idx_user_channel_access_assignedBy",
      "columnNames": [
        "assignedBy"
      ]
    }
  ],
  "checks": [
    {
      "name": "chk_user_channel_access_state",
      "expression": "`accessType` IN ('ALLOW','DENY')"
    }
  ]
}), false);
    await runner.createTable(new Table({
  "name": "user_roles",
  "columns": [
    {
      "name": "userId",
      "type": "int",
      "isPrimary": true
    },
    {
      "name": "roleId",
      "type": "int",
      "isPrimary": true
    }
  ],
  "uniques": [],
  "foreignKeys": [
    {
      "name": "fk_user_roles_userId",
      "columnNames": [
        "userId"
      ],
      "referencedTableName": "users",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    },
    {
      "name": "fk_user_roles_roleId",
      "columnNames": [
        "roleId"
      ],
      "referencedTableName": "roles",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    }
  ],
  "indices": [
    {
      "name": "idx_user_roles_userId",
      "columnNames": [
        "userId"
      ]
    },
    {
      "name": "idx_user_roles_roleId",
      "columnNames": [
        "roleId"
      ]
    }
  ],
  "checks": []
}), false);
    await runner.createTable(new Table({
  "name": "role_permissions",
  "columns": [
    {
      "name": "roleId",
      "type": "int",
      "isPrimary": true
    },
    {
      "name": "permissionId",
      "type": "int",
      "isPrimary": true
    }
  ],
  "uniques": [],
  "foreignKeys": [
    {
      "name": "fk_role_permissions_roleId",
      "columnNames": [
        "roleId"
      ],
      "referencedTableName": "roles",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    },
    {
      "name": "fk_role_permissions_permissionId",
      "columnNames": [
        "permissionId"
      ],
      "referencedTableName": "permissions",
      "referencedColumnNames": [
        "id"
      ],
      "onDelete": "RESTRICT"
    }
  ],
  "indices": [
    {
      "name": "idx_role_permissions_roleId",
      "columnNames": [
        "roleId"
      ]
    },
    {
      "name": "idx_role_permissions_permissionId",
      "columnNames": [
        "permissionId"
      ]
    }
  ],
  "checks": []
}), false);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.dropTable('role_permissions');
    await runner.dropTable('user_roles');
    await runner.dropTable('user_channel_access');
    await runner.dropTable('user_channel_collections');
    await runner.dropTable('channel_collection_items');
    await runner.dropTable('channel_collections');
    await runner.dropTable('channel_publications');
    await runner.dropTable('audit_logs');
    await runner.dropTable('auth_sessions');
    await runner.dropTable('permissions');
    await runner.dropTable('roles');
    await runner.dropTable('users');
    await runner.dropColumn('streams','isAvailable');
    await runner.dropColumn('channel_categories','isCurrent');
  }
}
