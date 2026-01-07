module.exports = (sequelize, DataTypes) => {
    const Notification = sequelize.define('Notification', {
        ID: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        UserID: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        Title: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        Message: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        Type: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        Link: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        IsRead: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        CreatedBy: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        Metadata: {
            type: DataTypes.JSON,
            allowNull: true
        },
        CreatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'Notifications',
        timestamps: false,
        indexes: [
            {
                fields: ['UserID', 'IsRead'],
                name: 'IX_Notifications_UserID_IsRead'
            }
        ]
    });

    return Notification;
};

