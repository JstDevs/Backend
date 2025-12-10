// models/UsersModel.js
module.exports = (sequelize, DataTypes) => {
  const UsersModel = sequelize.define('Users', {
    ID: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    EmployeeID: {
      type: DataTypes.BIGINT,
      allowNull: true,
     
    },
    Active: {
      type: DataTypes.TINYINT,
      allowNull: true,
    
    },
    UserName: {
      type: DataTypes.STRING,
      allowNull: true,
      
    },
    Password: {
      type: DataTypes.STRING,
      allowNull: true
    },
    UserAccessID: {
      type: DataTypes.BIGINT,
      allowNull: true,
      
    },

    userAccessArray: {
      type: DataTypes.TEXT, // or DataTypes.STRING(4000) depending on size
      allowNull: false,
      defaultValue: '[]', // Default to empty array JSON string
      get() {
        const rawValue = this.getDataValue('userAccessArray');
        if (!rawValue || rawValue.trim() === '') {
          return [];
        }
        
        // If it's already an array, return it
        if (Array.isArray(rawValue)) {
          return rawValue;
        }
        
        // Must be a string at this point
        if (typeof rawValue !== 'string') {
          return [];
        }
        
        const valueToParse = rawValue.trim();
        
        // Strategy 1: Try normal JSON.parse (handles properly formatted JSON)
        try {
          const parsed = JSON.parse(valueToParse);
          if (Array.isArray(parsed)) {
            return parsed;
          }
          // If parsed result is a string that looks like JSON, parse it again (double-encoded)
          if (typeof parsed === 'string' && (parsed.trim().startsWith('[') || parsed.trim().startsWith('{'))) {
            const doubleParsed = JSON.parse(parsed);
            if (Array.isArray(doubleParsed)) {
              return doubleParsed;
            }
          }
        } catch (firstError) {
          // Strategy 2: Handle malformed JSON like "["1","2"]" (double-encoded with unescaped quotes)
          // Remove outer quotes and try to extract the array
          if (valueToParse.startsWith('"') && valueToParse.endsWith('"')) {
            const innerContent = valueToParse.slice(1, -1);
            // Try to find array pattern in inner content
            const arrayMatch = innerContent.match(/\[.*?\]/);
            if (arrayMatch) {
              try {
                const parsed = JSON.parse(arrayMatch[0]);
                if (Array.isArray(parsed)) {
                  return parsed;
                }
              } catch {
                // If parsing fails, try to extract values manually from pattern like ["1","2"]
                const valueMatches = arrayMatch[0].match(/"([^"]+)"/g);
                if (valueMatches) {
                  return valueMatches.map(match => match.slice(1, -1));
                }
              }
            }
          }
          
          // Strategy 3: Handle incomplete JSON like "["2"] (missing closing bracket)
          const incompleteArrayMatch = valueToParse.match(/\[.*/);
          if (incompleteArrayMatch) {
            let incomplete = incompleteArrayMatch[0];
            // Try to complete it
            if (!incomplete.endsWith(']')) {
              incomplete += ']';
            }
            try {
              const parsed = JSON.parse(incomplete);
              if (Array.isArray(parsed)) {
                return parsed;
              }
            } catch {
              // Extract quoted values manually
              const valueMatches = incomplete.match(/"([^"]+)"/g);
              if (valueMatches) {
                return valueMatches.map(match => match.slice(1, -1));
              }
            }
          }
          
          // Strategy 4: Try to extract any array-like pattern
          const anyArrayMatch = valueToParse.match(/\[[\s\S]*?\]/);
          if (anyArrayMatch) {
            try {
              const parsed = JSON.parse(anyArrayMatch[0]);
              if (Array.isArray(parsed)) {
                return parsed;
              }
            } catch {
              // Extract all quoted strings as array items
              const allQuotedValues = valueToParse.match(/"([^"]+)"/g);
              if (allQuotedValues && allQuotedValues.length > 0) {
                return allQuotedValues.map(match => match.slice(1, -1));
              }
            }
          }
          
          // If all strategies fail, log and return empty array
          console.warn('Error parsing userAccessArray for user:', this.ID, 'Raw value:', rawValue, 'Error:', firstError.message);
          return [];
        }
        
        // Fallback: return empty array
        return [];
      },
      set(value) {
        // Ensure we always store valid JSON
        if (value === null || value === undefined) {
          this.setDataValue('userAccessArray', '[]');
        } else if (Array.isArray(value)) {
          this.setDataValue('userAccessArray', JSON.stringify(value));
        } else {
          // If it's already a string, try to validate it's valid JSON
          try {
            JSON.parse(value);
            this.setDataValue('userAccessArray', value);
          } catch {
            // If not valid JSON, default to empty array
            this.setDataValue('userAccessArray', '[]');
          }
        }
      }
      // Example structure:
      // [
      //   { fieldName: 'name', x: 100, y: 150, width: 300, height: 50, type: 'text' },
      //   { fieldName: 'dob', x: 100, y: 210, width: 200, height: 40, type: 'date' }
      // ]
    },
    Active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      
    },
    CreatedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      
    },
    CreatedDate: {
      type: DataTypes.DATE,
      allowNull: false,
     
    }
  }, {
    tableName: 'Users',
    timestamps: false
  });
 UsersModel.associate = function(models) {{
        // UsersModel.belongsTo(models.UserAccess, { foreignKey: 'UserAccessID', targetKey: 'ID',as: 'userAccess', });
       UsersModel.belongsToMany(models.UserAccess, {
        through: models.UserUserAccess,
        foreignKey: 'UserID',
        otherKey: 'UserAccessID',
        as: 'accessList'
      });
    }};
  return UsersModel;
};
