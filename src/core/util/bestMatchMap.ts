interface MatchMap {
  map: [number, number][];
  score: number;
}

export default function bestMatchMap<T>(
  a: T[],
  b: T[],
  comp: (aItem: T, bItem: T) => number
): [number, number][] {
  const pairMapGrid: MatchMap[][] = a.map((aItem, aIndex) =>
    b.map((bItem, bIndex) => {
      const score = comp(aItem, bItem);
      const map: MatchMap = {
        score,
        map: score > 0 ? [[aIndex, bIndex]] : []
      };
      return map;
    })
  );
  const mapGrid = pairMapGrid.reduceRight(
    (mapGrid: MatchMap[][], row, aIndex) => {
      const mapRow = row.reduceRight((mapRow: MatchMap[], myMap, bIndex) => {
        let bestMatch = myMap;
        let rightNeighbor = mapRow[bIndex + 1];
        if (rightNeighbor && rightNeighbor.score > bestMatch.score)
          bestMatch = rightNeighbor;
        const downNeigbor = mapGrid[aIndex + 1] && mapGrid[aIndex + 1][bIndex];
        if (downNeigbor && downNeigbor.score > bestMatch.score)
          bestMatch = downNeigbor;
        const diagNeigbor =
          mapGrid[aIndex + 1] && mapGrid[aIndex + 1][bIndex + 1];
        if (diagNeigbor && myMap.score + diagNeigbor.score > bestMatch.score)
          bestMatch = {
            score: myMap.score + diagNeigbor.score,
            map: myMap.map.concat(diagNeigbor.map)
          };
        mapRow[bIndex] = bestMatch;
        return mapRow;
      }, []);
      mapGrid[aIndex] = mapRow;
      return mapGrid;
    },
    []
  );
  return mapGrid[0][0].map;
}
