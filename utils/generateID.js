const generateLinkID = () => {
 //generate 8 digit random number
 return Math.floor(10000000 + Math.random() * 90000000).toString();

};
module.exports=generateLinkID