import bestMatchMap from "../../src/core/util/bestMatchMap";
import { compareTwoStrings } from "string-similarity";
import fs from "fs";
import { SrcStrings } from "../../src/core/SrcString";

test("BMM: Skip one", () => {
  const result = bestMatchMap(
    ["apple", "banana", "car"],
    ["apple", "car"],
    compareTwoStrings
  );
  expect(result).toEqual([[0, 0], [2, 1]]);
});

test("BMM: Skip first", () => {
  const result = bestMatchMap(
    ["apple", "banana", "car"],
    ["banana", "car"],
    compareTwoStrings
  );
  expect(result).toEqual([[1, 0], [2, 1]]);
});

test("BMM: Fuzzy internals", () => {
  const result = bestMatchMap(
    ["apple", "banana", "car", "dog"],
    ["apple", "boat", "Banana", "dog"],
    compareTwoStrings
  );
  expect(result).toEqual([[0, 0], [1, 2], [3, 3]]);
});

test("BMM: No zero matches", () => {
  const result = bestMatchMap(
    ["apple", "banana", "car"],
    ["---", "banana", "car"],
    compareTwoStrings
  );
  expect(result).toEqual([[1, 1], [2, 2]]);
});

test("BMM: Src Strings Comp", () => {
  const srcA: SrcStrings = JSON.parse(
    fs.readFileSync("test/data/l1v6strings.json").toString()
  );
  const srcB: SrcStrings = JSON.parse(
    fs.readFileSync("test/data/l1v12strings.json").toString()
  );
  const result = bestMatchMap(srcA, srcB, (a, b) =>
    compareTwoStrings(a.text, b.text)
  );
  expect(result).toEqual([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
    [6, 6],
    [7, 7],
    [8, 8],
    [9, 9],
    [10, 10],
    [11, 11],
    [12, 12],
    [13, 13],
    [14, 14],
    [15, 15],
    [16, 16],
    [17, 17],
    [18, 18],
    [19, 19],
    [20, 20],
    [21, 21],
    [22, 22],
    [23, 23],
    [24, 24],
    [25, 25],
    [26, 26],
    [27, 27],
    [28, 28],
    [29, 29],
    [30, 30],
    [31, 31],
    [32, 32],
    [33, 33],
    [34, 34],
    [35, 35],
    [36, 36],
    [37, 37],
    [38, 38],
    [39, 39],
    [40, 40],
    [41, 41],
    [42, 42],
    [43, 43],
    [44, 44],
    [45, 45],
    [46, 46],
    [47, 47],
    [48, 48],
    [49, 49],
    [50, 50],
    [53, 51],
    [54, 52],
    [55, 53],
    [56, 54],
    [57, 55],
    [58, 56],
    [59, 57],
    [61, 58],
    [62, 59],
    [63, 60],
    [64, 61],
    [65, 62],
    [66, 63],
    [67, 64],
    [68, 65],
    [69, 66],
    [70, 67],
    [71, 68],
    [72, 69],
    [73, 70],
    [74, 71],
    [75, 72],
    [76, 73],
    [77, 74],
    [78, 75],
    [79, 76],
    [80, 77],
    [81, 78],
    [82, 79],
    [83, 80],
    [84, 81],
    [85, 82],
    [86, 83],
    [87, 84],
    [88, 85],
    [89, 86],
    [90, 87],
    [91, 88],
    [92, 89],
    [93, 90],
    [94, 91],
    [95, 93],
    [96, 96],
    [98, 98],
    [99, 99],
    [100, 100],
    [101, 101],
    [102, 102],
    [103, 103],
    [104, 104],
    [106, 105],
    [107, 106],
    [108, 107],
    [109, 109],
    [110, 110],
    [112, 112],
    [114, 113],
    [115, 114],
    [116, 115],
    [118, 116],
    [119, 117],
    [120, 118],
    [122, 119],
    [123, 120],
    [124, 121],
    [125, 122],
    [127, 123],
    [128, 124],
    [130, 125],
    [131, 126],
    [132, 127],
    [133, 128],
    [134, 129],
    [135, 130],
    [136, 131],
    [137, 132],
    [138, 133],
    [139, 134],
    [140, 135],
    [141, 136],
    [142, 137],
    [143, 138],
    [144, 139],
    [145, 140],
    [146, 141],
    [147, 142],
    [148, 143],
    [149, 144],
    [150, 145],
    [152, 146],
    [153, 147],
    [154, 148],
    [155, 149],
    [156, 150],
    [157, 151],
    [158, 152],
    [159, 153],
    [160, 154],
    [161, 155],
    [162, 156],
    [163, 157],
    [164, 158],
    [165, 159],
    [166, 160],
    [167, 161],
    [168, 162],
    [169, 163],
    [170, 164],
    [171, 165],
    [172, 166],
    [173, 167],
    [174, 168],
    [175, 169],
    [176, 170],
    [177, 171],
    [178, 172],
    [179, 173],
    [180, 174],
    [181, 175],
    [182, 176],
    [183, 177],
    [184, 178],
    [185, 179],
    [186, 180],
    [187, 181],
    [188, 182],
    [189, 183],
    [190, 184],
    [191, 185],
    [192, 186],
    [193, 187],
    [194, 188],
    [195, 189],
    [196, 190],
    [197, 191],
    [198, 192],
    [199, 193],
    [200, 194],
    [201, 195],
    [202, 196],
    [203, 197],
    [204, 198],
    [205, 199],
    [206, 200],
    [207, 201],
    [208, 202],
    [209, 203],
    [210, 204],
    [211, 205],
    [212, 206],
    [213, 207],
    [214, 208],
    [215, 209],
    [216, 210],
    [217, 211],
    [218, 212],
    [219, 213],
    [220, 214],
    [221, 215],
    [222, 216],
    [223, 217],
    [224, 218],
    [225, 219],
    [226, 220],
    [227, 221],
    [228, 222],
    [229, 223],
    [230, 224],
    [231, 225],
    [232, 226],
    [233, 227],
    [234, 228],
    [235, 229],
    [236, 230],
    [237, 231],
    [238, 232],
    [239, 233],
    [240, 234],
    [241, 235],
    [242, 237],
    [243, 239],
    [244, 240]
  ]);
});
