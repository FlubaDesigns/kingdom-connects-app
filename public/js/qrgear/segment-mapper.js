const SEGMENT_TYPES = {
  BUSINESS: 'business',
  CHURCH: 'church',
  MEMBER: 'member'
};

const SEGMENT_PREFIXES = {
  business: 'KC-BIZ',
  church: 'KC-CHR',
  member: 'KC-MEM'
};

function generateSegmentId(entityType, entityId) {
  const prefix = SEGMENT_PREFIXES[entityType];
  if (!prefix || typeof entityId !== 'string' || !entityId || entityId.includes('/')) {
    throw new Error('A valid entity type and permanent record ID are required.');
  }
  return `${prefix}-${entityId}`;
}

function parseSegmentId(segmentId) {
  if (!segmentId || typeof segmentId !== 'string') {
    return null;
  }
  
  const parts = segmentId.split('-');
  if (parts.length < 3 || parts[0] !== 'KC') {
    return null;
  }
  
  const typeCode = parts[1];
  const entityId = parts.slice(2).join('-');
  
  let entityType = null;
  if (typeCode === 'BIZ') entityType = 'business';
  else if (typeCode === 'CHR') entityType = 'church';
  else if (typeCode === 'MEM') entityType = 'member';
  
  return entityType ? { entityType, entityId } : null;
}

function getKcPageUrl(entityType, entityId) {
  const baseUrl = 'https://kingdomconnects.org';
  
  switch (entityType) {
    case 'business':
      return `${baseUrl}/business?id=${encodeURIComponent(entityId)}`;
    case 'church':
      return `${baseUrl}/church?id=${encodeURIComponent(entityId)}`;
    case 'member':
      return `${baseUrl}/member/index`;
    default:
      return baseUrl;
  }
}

export { 
  SEGMENT_TYPES, 
  SEGMENT_PREFIXES,
  generateSegmentId, 
  parseSegmentId, 
  getKcPageUrl 
};
