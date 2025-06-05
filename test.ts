interface Test1 {
  firstNameKiRverylong? : {
    lastName? : string;
    age       : number;
  };
  lastName : string;
  age      : number;
  email    : string;
}

// type Test2 = {
//   firstName? : string;
//   lastName   : string;
//   age?       : number;
//   email      : string;
// }

// function Test3(
//   firstName        : string,
//   lastName         : string,
//   ageIsJustANumber : number | string = 69,
//   email            : string          = 'abc@ki.r',
// ): string {
//   return 'kir'
// }