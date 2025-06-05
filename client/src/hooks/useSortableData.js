import React, { useState, useMemo } from "react";

// Code from https://www.smashingmagazine.com/2020/03/sortable-tables-react/

const useSortableData = (items, config = {key: 'lastlogin', dir: 'desc'}) => {
    const [sortConfig, setSortConfig] = useState(config);
    
    const sortedItems = useMemo(() => {
      let sortableItems = [...items];
      if (sortConfig !== null) {
        sortableItems.sort((a, b) => {
          if (a[sortConfig.key] < b[sortConfig.key]) {
            return sortConfig.dir === 'asc' ? -1 : 1;
          }
          if (a[sortConfig.key] > b[sortConfig.key]) {
            return sortConfig.dir === 'asc' ? 1 : -1;
          }
          return 0;
        });
      }
      return sortableItems;
    }, [items, sortConfig]);
  
    const requestSort = key => {
      let dir = 'asc';
      if (sortConfig && sortConfig.key === key && sortConfig.dir === 'asc') {
        dir = 'desc';
      }
      setSortConfig({ key, dir });
    }
  
    return { items: sortedItems, requestSort, sortConfig };
}

export default useSortableData;