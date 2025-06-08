type myType = {
  first  : string
  second : boolean
  third  : string | number
}

interface myInterface {
  first  : string
  second : boolean
  third  : string | number
}

function myFunction(
  firstArg  : string          = 'Hello world!',
  secondArg : boolean         = false,
  third     : string | number = 22
){}

class MyClass {
  public    firstProp     : string[]        = []
  private   second        : boolean         = true
  protected thirdProperty : number | string = 'hi there'
  public    fourth        = 'hey'

  constructor(
    firstParam             : string  = 'hello world',
    public  secondParam    = 'Hi',
    private thirdParameter = 'Hey there',
    fourthParam            : boolean = false
  ){}
}

const firstVar      = 'hello world'
let   secondVar     : number  = 10
let   thirdVariable : boolean