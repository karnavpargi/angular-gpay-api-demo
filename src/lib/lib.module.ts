import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { GooglePayButtonDirective } from './gpay-button/gpay-button.directive';

@NgModule({
  imports: [CommonModule],
  declarations: [GooglePayButtonDirective],
  providers: [],
  exports: [GooglePayButtonDirective],
})
export class LibModule {}
